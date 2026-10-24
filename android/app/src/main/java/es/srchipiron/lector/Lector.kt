package es.srchipiron.lector

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.WindowManager
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.SecureRandom
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * El servicio del lector: graba la pantalla de la tablet (MediaProjection,
 * el permiso normal de «grabar pantalla») y se la da a Node por 127.0.0.1
 * con un secreto. Node (scripts/lector/en-tablet.mjs) lee el draft y
 * contesta a la app del móvil por la wifi, con el código de vinculación.
 *
 * SEGURIDAD: solo LEE la pantalla. No toca nada, no usa accesibilidad ni
 * superposiciones, y el puerto de la captura solo escucha en 127.0.0.1.
 */
class Lector : Service() {
    companion object {
        const val EMPEZAR = "empezar"
        const val PARAR = "parar"
        const val CODIGO_RESULTADO = "resultado"
        const val DATOS = "datos"
        private const val CANAL = "lector"

        @Volatile var grabando = false
            private set
        @Volatile var estado = "Parado"
            private set
    }

    private var proyeccion: MediaProjection? = null
    private var pantalla: VirtualDisplay? = null
    private var lector: ImageReader? = null
    private val cerrojo = Any()
    private var ultima: Image? = null
    private var hiloImagenes: HandlerThread? = null
    private var voz: TextToSpeech? = null
    private var burbuja: Burbuja? = null
    @Volatile private var vozLista = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        voz = TextToSpeech(this) { s -> vozLista = s == TextToSpeech.SUCCESS }
        // La salud de la tablet (3.63.0): cada 15 s, para que el lector la cuente y la app del móvil la suba.
        thread(isDaemon = true, name = "salud") { while (true) { try { escribirSalud() } catch (e: Throwable) {}; Thread.sleep(15000) } }
        Interno.decir = ::decir
        val puerto = Interno.arrancar()
        if (Nodo.fallo != null) { estado = Nodo.fallo!!; return }
        Nodo.arrancar(this, mapOf(
            "LECTOR_INTERNO" to "http://127.0.0.1:$puerto",
            "LECTOR_SECRETO" to Interno.secreto,
            "LECTOR_CODIGO" to Vinculo.codigo(this),
            "LECTOR_CASA" to filesDir.absolutePath,
            "LECTOR_ULTIMA_SALIDA" to (Salidas.ultima(this) ?: ""),
        )) { codigo ->
            estado = "El lector se ha parado ($codigo). Vuelve a abrir la app."
            Salidas.apuntarNodo(this, codigo)
            android.os.Process.killProcess(android.os.Process.myPid())
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            EMPEZAR -> try {
                // Android 14: primero en primer plano con el tipo de grabar pantalla, luego la grabación.
                val notificacion = notificacion()
                if (Build.VERSION.SDK_INT >= 29) startForeground(1, notificacion, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
                else startForeground(1, notificacion)
                val datos: Intent? = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(DATOS, Intent::class.java) else @Suppress("DEPRECATION") intent.getParcelableExtra(DATOS)
                val codigo = intent.getIntExtra(CODIGO_RESULTADO, Activity.RESULT_CANCELED)
                // Ya grabando (3.72.1): un segundo permiso no se usa. Empezar otra vez
                // paraba la grabación buena para probar uno que Android ya pudo anular.
                if (grabando) Unit
                else if (datos != null && codigo == Activity.RESULT_OK) empezar(codigo, datos) else { estado = "Sin permiso para grabar la pantalla"; stopSelf() }
            } catch (e: Throwable) {
                // Un fallo al empezar a grabar (3.72.1) ya no cierra la app: se dice
                // en la pantalla, con el detalle para copiarlo, y se deja de intentar.
                estado = "No se pudo empezar a grabar: ${e.javaClass.simpleName}: ${e.message ?: ""}".take(300)
                try { java.io.File(filesDir, "fallo-grabar.txt").writeText(android.util.Log.getStackTraceString(e).take(4000)) } catch (x: Throwable) {}
                try { parar() } catch (x: Throwable) {}
                try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (x: Throwable) {}
                stopSelf()
            }
            PARAR -> {
                parar(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
                // Al dejar de leer es cuando se puede actualizar sin cortar nada (3.64.0).
                thread(isDaemon = true) { try { Actualizar.sola(applicationContext) } catch (e: Throwable) {} }
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        parar()
        Interno.decir = null
        voz?.shutdown()
        super.onDestroy()
    }

    private fun empezar(codigo: Int, datos: Intent) {
        parar()
        val gestor = getSystemService(MediaProjectionManager::class.java)
        val p = gestor.getMediaProjection(codigo, datos) ?: run { estado = "Android no dio la grabación"; return }
        proyeccion = p
        val hilo = HandlerThread("imagenes").also { it.start() }
        hiloImagenes = hilo
        val manejador = Handler(hilo.looper)
        p.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { parar(); estado = "Grabación parada" }
        }, manejador)
        // Siempre apaisada: el juego va apaisado y el lector está medido así.
        val (w, h) = if (Build.VERSION.SDK_INT >= 30) getSystemService(WindowManager::class.java).maximumWindowMetrics.bounds.let { it.width() to it.height() }
            else @Suppress("DEPRECATION") android.util.DisplayMetrics().also { getSystemService(WindowManager::class.java).defaultDisplay.getRealMetrics(it) }.let { it.widthPixels to it.heightPixels }
        val ancho = maxOf(w, h)
        val alto = minOf(w, h)
        val r = ImageReader.newInstance(ancho, alto, PixelFormat.RGBA_8888, 2)
        r.setOnImageAvailableListener({ lr ->
            val nueva = try { lr.acquireLatestImage() } catch (e: IllegalStateException) { null } ?: return@setOnImageAvailableListener
            synchronized(cerrojo) { ultima?.close(); ultima = nueva }
        }, manejador)
        lector = r
        pantalla = p.createVirtualDisplay("lector", ancho, alto, resources.displayMetrics.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, manejador)
        Interno.captura = ::captura
        burbuja = Burbuja(this).also { it.empezar() }
        grabando = true
        estado = "Grabando la pantalla (${ancho}×${alto})"
    }

    private fun parar() {
        grabando = false
        Interno.captura = null
        burbuja?.parar(); burbuja = null
        pantalla?.release(); pantalla = null
        synchronized(cerrojo) { ultima?.close(); ultima = null }
        lector?.close(); lector = null
        proyeccion?.stop(); proyeccion = null
        hiloImagenes?.quitSafely(); hiloImagenes = null
        if (estado.startsWith("Grabando")) estado = "Parado"
    }

    private fun escribirSalud() {
        val am = getSystemService(android.app.ActivityManager::class.java)
        val mem = android.app.ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val j = org.json.JSONObject()
            .put("apk", packageManager.getPackageInfo(packageName, 0).versionName ?: "?")
            .put("modelo", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("android", Build.VERSION.SDK_INT)
            .put("grabando", grabando)
            .put("burbuja", android.provider.Settings.canDrawOverlays(this))
            .put("esquina", Burbuja.esquina(this))
            .put("burbujaEstado", Burbuja.estado)
            .put("bateriaLibre", getSystemService(android.os.PowerManager::class.java).isIgnoringBatteryOptimizations(packageName))
            .put("memoriaLibreMB", mem.availMem / 1_000_000)
            .put("memoriaBaja", mem.lowMemory)
            .put("memoriaAppMB", android.os.Debug.getPss() / 1000)
            .put("cuando", System.currentTimeMillis())
        val tmp = java.io.File(filesDir, "salud.json.tmp")
        tmp.writeText(j.toString())
        tmp.renameTo(java.io.File(filesDir, "salud.json"))
    }

    /** La captura como la da `screencap` sin -p: 16 bytes de cabecera (ancho, alto, RGBA_8888, espacio de color) y los píxeles. */
    private fun captura(): ByteArray? = synchronized(cerrojo) {
        val img = ultima ?: return null
        val plano = img.planes[0]
        val buf = plano.buffer
        val ancho = img.width; val alto = img.height; val fila = ancho * 4
        val salida = ByteArray(16 + fila * alto)
        ByteBuffer.wrap(salida, 0, 16).order(ByteOrder.LITTLE_ENDIAN).putInt(ancho).putInt(alto).putInt(1).putInt(0)
        for (y in 0 until alto) {
            buf.position(y * plano.rowStride)
            buf.get(salida, 16 + y * fila, fila)
        }
        salida
    }

    private fun decir(texto: String, idioma: String): Boolean {
        val tts = voz ?: return false
        if (!vozLista) return false
        tts.language = if (idioma == "en") Locale.ENGLISH else Locale("es", "ES")
        val fin = CountDownLatch(1)
        val id = "aviso-${System.nanoTime()}"
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(u: String?) {}
            override fun onDone(u: String?) { if (u == id) fin.countDown() }
            @Deprecated("") override fun onError(u: String?) { if (u == id) fin.countDown() }
        })
        tts.speak(texto, TextToSpeech.QUEUE_ADD, null, id)
        fin.await(45, TimeUnit.SECONDS)
        return true
    }

    private fun notificacion(): Notification {
        val gestor = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) gestor.createNotificationChannel(NotificationChannel(CANAL, "Lector", NotificationManager.IMPORTANCE_LOW))
        val abrir = PendingIntent.getActivity(this, 0, Intent(this, Principal::class.java), PendingIntent.FLAG_IMMUTABLE)
        val parar = PendingIntent.getService(this, 1, Intent(this, Lector::class.java).setAction(PARAR), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CANAL)
            .setContentTitle("Lector MLBB")
            .setContentText("Leyendo el draft para la app del móvil")
            .setSmallIcon(R.drawable.icono_mono)
            .setContentIntent(abrir)
            .addAction(Notification.Action.Builder(null, "Parar", parar).build())
            .setOngoing(true)
            .build()
    }
}


/**
 * El puerto por el que Node pide la captura y la voz: UNO por proceso, como
 * Node (que se arranca una vez y se queda con esta dirección y este secreto).
 * Solo 127.0.0.1 y solo con el secreto. El servicio enchufa la captura al
 * empezar a grabar y la quita al parar: sin ella, 409 («no está grabando»).
 */
object Interno {
    val secreto: String = ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    @Volatile var captura: (() -> ByteArray?)? = null
    @Volatile var decir: ((String, String) -> Boolean)? = null
    private var servidor: ServerSocket? = null
    // Pocas conexiones a la vez y con plazo: este puerto solo lo usa Node, y
    // otra app de la tablet no puede ahogarlo abriendo sockets sin fin.
    private val plazas = java.util.concurrent.Semaphore(8)

    /** El puerto por el que Node pide la captura y la voz: solo 127.0.0.1, solo con el secreto. */
    @Synchronized
    fun arrancar(): Int {
        servidor?.let { return it.localPort }
        val s = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
        servidor = s
        thread(isDaemon = true, name = "interno") {
            while (!s.isClosed) {
                val c = try { s.accept() } catch (e: Exception) { break }
                if (!plazas.tryAcquire()) { try { c.close() } catch (e: Exception) {}; continue }
                thread(isDaemon = true) { try { c.soTimeout = 5000; atender(c) } finally { plazas.release() } }
            }
        }
        return s.localPort
    }

    private fun atender(c: Socket) = c.use {
        try {
            val entrada = BufferedInputStream(c.getInputStream())
            val primera = linea(entrada) ?: return
            val cabeceras = mutableMapOf<String, String>()
            // Como mucho 50 cabeceras: más no es Node, y se corta.
            var vistas = 0
            while (true) {
                val l = linea(entrada) ?: return
                if (l.isEmpty()) break
                if (++vistas > 50) return
                val i = l.indexOf(':')
                if (i > 0) cabeceras[l.substring(0, i).trim().lowercase()] = l.substring(i + 1).trim()
            }
            val salida = c.getOutputStream()
            if (cabeceras["x-secreto"] != secreto) return responder(salida, 403, ByteArray(0))
            val partes = primera.split(" ")
            val metodo = partes.getOrNull(0); val ruta = partes.getOrNull(1)
            when {
                metodo == "GET" && ruta == "/captura" -> {
                    val img = captura?.invoke()
                    if (img == null) responder(salida, 409, ByteArray(0)) else responder(salida, 200, img)
                }
                metodo == "POST" && ruta == "/voz" -> {
                    val largo = (cabeceras["content-length"]?.toIntOrNull() ?: 0).coerceIn(0, 4096)
                    val cuerpo = ByteArray(largo)
                    var leidos = 0
                    while (leidos < largo) { val n = entrada.read(cuerpo, leidos, largo - leidos); if (n < 0) break; leidos += n }
                    val j = JSONObject(String(cuerpo, Charsets.UTF_8))
                    val dicho = decir?.invoke(j.optString("texto").take(400), j.optString("idioma")) ?: false
                    responder(salida, if (dicho) 200 else 404, "{}".toByteArray())
                }
                else -> responder(salida, 404, ByteArray(0))
            }
        } catch (e: Exception) { /* una petición rota no tira el lector */ }
    }

    private fun linea(e: BufferedInputStream): String? {
        val b = StringBuilder()
        while (true) {
            val c = e.read()
            if (c < 0) return if (b.isEmpty()) null else b.toString()
            if (c == '\n'.code) return b.toString().trimEnd('\r')
            if (b.length > 8192) return null
            b.append(c.toChar())
        }
    }

    private fun responder(s: OutputStream, estadoHttp: Int, cuerpo: ByteArray) {
        s.write("HTTP/1.1 $estadoHttp X\r\nContent-Length: ${cuerpo.size}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n".toByteArray())
        s.write(cuerpo)
        s.flush()
    }

}

/** El código de vinculación: se crea una vez y se guarda en la tablet. */
object Vinculo {
    private const val LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    fun codigo(contexto: Context): String {
        val prefs = contexto.getSharedPreferences("lector", Context.MODE_PRIVATE)
        prefs.getString("codigo", null)?.let { return it }
        val azar = SecureRandom()
        val nuevo = (1..10).map { LETRAS[azar.nextInt(LETRAS.length)] }.joinToString("")
        prefs.edit().putString("codigo", nuevo).apply()
        return nuevo
    }
    fun nuevo(contexto: Context) { contexto.getSharedPreferences("lector", Context.MODE_PRIVATE).edit().remove("codigo").apply() }
}
