package es.srchipiron.lector

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.projection.MediaProjectionManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.URL
import kotlin.concurrent.thread

/**
 * La pantalla de la app en la tablet (3.64.0): una GUÍA paso a paso para
 * quien la instala por primera vez, en la que cada paso se marca solo
 * cuando está hecho (permisos, grabar, el móvil vinculado), con el botón
 * que lo hace al lado. Debajo, los detalles: estado, por qué se cerró la
 * última vez y las últimas líneas del lector.
 */
class Principal : Activity() {
    companion object {
        const val PUERTO = 47323
        const val APP = "https://srchipiron.github.io/mobile-legends-pick-assist/"
        private const val PEDIR_GRABAR = 7
        /** Mobile Legends (3.70.0): se abre solo al empezar a leer. Solo se abre: nada lo toca. */
        const val JUEGO = "com.mobile.legends"
    }

    /** Ya se pidió grabar al abrir esta pantalla (3.70.0): si dices que no, no se vuelve a pedir en bucle. */
    private var pedidoAlAbrir = false

    /** Un paso de la guía: su marca, su texto y, si hace falta, su botón. */
    private inner class Paso(val texto: String, boton: String? = null, accion: (() -> Unit)? = null) {
        val fila = LinearLayout(this@Principal).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(6), 0, dp(6)) }
        val linea = TextView(this@Principal).apply { textSize = 16f; setTextColor(Color.WHITE) }
        val btn = boton?.let { Button(this@Principal).apply { text = it; setOnClickListener { accion?.invoke() } } }
        init { fila.addView(linea); btn?.let { fila.addView(it) } }
        fun marcar(hecho: Boolean, n: Int) {
            linea.text = "${if (hecho) "✓" else "$n."}  $texto"
            linea.setTextColor(if (hecho) Color.rgb(48, 209, 88) else Color.WHITE)
            btn?.visibility = if (hecho) View.GONE else View.VISIBLE
        }
    }

    private fun dp(x: Int) = (x * resources.displayMetrics.density).toInt()

    private lateinit var estado: TextView
    private lateinit var vinculo: TextView
    private lateinit var qr: ImageView
    private lateinit var boton: Button
    private lateinit var esquinaBurbuja: Button
    private lateinit var actualizar: TextView
    private lateinit var registro: TextView
    private lateinit var pasos: List<Paso>
    private lateinit var botonesLinea: List<Button>
    private lateinit var apagarSolo: Button
    @Volatile private var nueva: Actualizar.Nueva? = null
    @Volatile private var movilLee = false
    private val reloj = Handler(Looper.getMainLooper())
    private var qrDe: String? = null
    private var ultimaSalida: String? = null

    override fun onCreate(guardado: Bundle?) {
        super.onCreate(guardado)
        // Si algo cierra la app, la próxima vez se enseña por qué (sin ordenador no hay otra forma de verlo).
        val previo = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { hilo, e ->
            try { java.io.File(filesDir, "fallo.txt").writeText(android.util.Log.getStackTraceString(e).take(4000)) } catch (x: Throwable) {}
            previo?.uncaughtException(hilo, e)
        }
        val pad = dp(16)
        // En una tablet (o un móvil tumbado) hay sitio para dos columnas: la
        // guía a un lado y el QR y los ajustes al otro (3.65.5). En vertical, una.
        val dosColumnas = resources.configuration.screenWidthDp >= 720
        fun texto(tam: Float, color: Int = Color.WHITE) = TextView(this).apply { textSize = tam; setTextColor(color); setPadding(0, pad / 3, 0, pad / 3); setLineSpacing(0f, 1.15f) }
        fun titulo(t: String) = texto(18f, Color.rgb(255, 214, 10)).apply { text = t; typeface = Typeface.DEFAULT_BOLD; setPadding(0, 0, 0, pad / 3) }
        /** Una tarjeta como las de Pick Assist: gris sobre negro, esquinas redondas. */
        fun tarjeta() = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
            background = GradientDrawable().apply { setColor(Color.rgb(28, 28, 30)); cornerRadius = dp(14).toFloat() }
        }
        fun separada() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) }
        val izquierda = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val derecha = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        izquierda.addView(texto(26f, Color.rgb(255, 214, 10)).apply { text = "Lector MLBB"; typeface = Typeface.DEFAULT_BOLD; setPadding(0, 0, 0, 0) })
        // La versión instalada, a la vista (3.65.5): para saber si está al día sin buscarla en Ajustes de Android.
        val instalada = try { packageManager.getPackageInfo(packageName, 0).versionName } catch (e: Exception) { null }
        izquierda.addView(texto(13f, Color.GRAY).apply { text = instalada?.let { "Versión $it" } ?: ""; setPadding(0, 0, 0, pad / 2) })
        izquierda.addView(texto(14f, Color.LTGRAY).apply {
            text = "Lee el draft de Mobile Legends de la pantalla de esta tablet, te dice qué héroe coger en la burbuja y apunta tus partidas. Ábrela, acepta grabar y juega: no hace falta el móvil. " +
                "Solo MIRA la pantalla: no toca el juego ni tu cuenta. Aun así, es una herramienta de terceros: úsala bajo tu responsabilidad."
            setPadding(0, 0, 0, pad)
        })
        actualizar = texto(14f, Color.rgb(100, 210, 255)).apply { visibility = View.GONE }
        izquierda.addView(actualizar)

        val guia = tarjeta()
        guia.addView(titulo("Paso a paso"))
        pasos = listOf(
            Paso("Deja que la app te avise (resumen de cada partida).", "Permitir avisos") {
                if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            },
            Paso("Que el ahorro de batería no la cierre con el juego delante.", "Quitar el ahorro de batería") {
                @Suppress("BatteryLife")
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            },
            Paso("Permite la burbuja: tu nº1 sale encima del juego (puedes quitarla abajo).", "Permitir la burbuja") {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            },
            Paso("Empieza a leer. Android pregunta qué grabar: elige «Pantalla completa».", "Empezar a leer") { alternar() },
            Paso("«Sin móvil»: la tablet lee el draft y decide ella sola con tu línea (la de la app del móvil, o la que elijas aquí), y tu nº1 sale en la burbuja."),
            Paso("(Opcional) Con Pick Assist en el MÓVIL: abre la cámara, escanea el QR y toca «Vincular» (misma wifi). Con el móvil, además se apuntan tus partidas y suena la voz."),
            Paso("Juega. En baneos la burbuja dice a quién banear; en picks, tu nº1 y los dos siguientes."),
        )
        for (p in pasos) guia.addView(p.fila)
        izquierda.addView(guia, separada())

        // Un solo aparato (3.66.0): con la línea elegida, la tablet decide sola.
        val sinMovil = tarjeta()
        sinMovil.addView(titulo("Sin móvil"))
        sinMovil.addView(texto(14f, Color.LTGRAY).apply { text = "Elige tu línea y la tablet decide sola, con los mismos datos que Pick Assist: en baneos, a quién banear; en picks, tu nº1. Si Pick Assist del móvil está leyendo, manda el móvil." })
        val filaLineas = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val filaLineas2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        botonesLinea = Solo.LINEAS.mapIndexed { i, (clave, nombre) ->
            Button(this).apply {
                tag = clave; text = nombre
                setOnClickListener { Solo.guardar(this@Principal, clave); refrescar() }
            }.also { (if (i < 3) filaLineas else filaLineas2).addView(it, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)) }
        }
        apagarSolo = Button(this).apply { text = "Apagado"; setOnClickListener { Solo.guardar(this@Principal, null); refrescar() } }
        filaLineas2.addView(apagarSolo, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        sinMovil.addView(filaLineas)
        sinMovil.addView(filaLineas2)
        derecha.addView(sinMovil, separada())

        val enlazar = tarjeta()
        enlazar.addView(titulo("Vincular el móvil"))
        vinculo = texto(16f).apply { typeface = Typeface.MONOSPACE }.also { enlazar.addView(it) }
        qr = ImageView(this).apply { adjustViewBounds = true }
        enlazar.addView(qr, LinearLayout.LayoutParams(dp(240), dp(240)).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = dp(8); bottomMargin = dp(8) })
        // Un código nuevo invalida el viejo: Node lo leyó al arrancar, así que
        // la app se cierra y se vuelve a abrir con el nuevo (Node no se reinicia en el mismo proceso).
        enlazar.addView(Button(this).apply { text = "Código nuevo (desvincula el móvil)"; setOnClickListener { codigoNuevo() } })
        derecha.addView(enlazar, separada())

        val ajustes = tarjeta()
        ajustes.addView(titulo("Ajustes y detalles"))
        boton = Button(this).apply { textSize = 18f; setOnClickListener { alternar() } }
        ajustes.addView(boton)
        esquinaBurbuja = Button(this).apply { setOnClickListener { Burbuja.siguienteEsquina(this@Principal); refrescar() } }
        ajustes.addView(esquinaBurbuja)
        // Abrir el juego al empezar a leer (3.70.0), sí por defecto.
        val prefs = getSharedPreferences("lector", MODE_PRIVATE)
        fun textoJuego() = "Abrir Mobile Legends al empezar: ${if (prefs.getBoolean("abrirJuego", true)) "sí" else "no"} (toca para cambiar)"
        ajustes.addView(Button(this).apply {
            text = textoJuego()
            setOnClickListener { prefs.edit().putBoolean("abrirJuego", !prefs.getBoolean("abrirJuego", true)).apply(); text = textoJuego() }
        })
        estado = texto(14f).also { ajustes.addView(it) }
        ajustes.addView(texto(13f, Color.LTGRAY).apply { text = "Mientras lee, la tablet graba su pantalla: si abres otra app, el lector también la ve. La grabación no sale de la tablet; al móvil solo van nombres de héroes." })
        ajustes.addView(texto(14f, Color.LTGRAY).apply { text = "Últimas líneas del lector:" })
        registro = texto(12f, Color.LTGRAY).apply { typeface = Typeface.MONOSPACE }.also { ajustes.addView(it) }
        derecha.addView(ajustes, separada())

        val cuerpo = LinearLayout(this).apply { orientation = if (dosColumnas) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL; setBackgroundColor(Color.BLACK) }
        if (dosColumnas) {
            cuerpo.addView(izquierda, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = dp(12) })
            cuerpo.addView(derecha, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        } else {
            cuerpo.addView(izquierda)
            cuerpo.addView(derecha)
        }
        val desplazar = ScrollView(this).apply { addView(cuerpo); setBackgroundColor(Color.BLACK); clipToPadding = false }
        // Desde Android 15 la app se dibuja DEBAJO de la barra de estado y de la
        // de navegación (edge-to-edge obligatorio con targetSdk 35): sin este
        // margen, las primeras frases quedaban tapadas en la tablet (3.65.5).
        desplazar.setOnApplyWindowInsetsListener { v, insets ->
            val (izq, arriba, der, abajo) = if (Build.VERSION.SDK_INT >= 30) {
                val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                listOf(i.left, i.top, i.right, i.bottom)
            } else {
                @Suppress("DEPRECATION")
                listOf(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            v.setPadding(pad + izq, pad + arriba, pad + der, pad + abajo)
            insets
        }
        setContentView(desplazar)
    }

    override fun onResume() {
        super.onResume()
        tic()
        // Se actualiza sola (3.64.0): si hay una más nueva y no está leyendo, la instala.
        thread(isDaemon = true) {
            val n = try { Actualizar.sola(this) } catch (e: Throwable) { null }
            nueva = n
            runOnUiThread {
                refrescar()
                // Abrir y jugar (3.70.0): sin versión nueva que instalar, pide grabar
                // nada más abrir (Android exige ese toque cada vez) y luego abre el juego.
                if (n == null && !Lector.grabando && !pedidoAlAbrir && !isFinishing) { pedidoAlAbrir = true; alternar() }
            }
        }
    }

    override fun onPause() { reloj.removeCallbacksAndMessages(null); super.onPause() }

    private fun tic() {
        refrescar()
        // ¿El móvil ya lee? Lo dice el propio lector (sus lecturas), cada 3 s.
        if (Nodo.arrancado && System.currentTimeMillis() / 1000 % 3 == 0L) thread(isDaemon = true) { movilLee = lecturasDelLector() > 0 }
        reloj.postDelayed({ tic() }, 1000)
    }

    private fun lecturasDelLector(): Int = try {
        val c = URL("http://127.0.0.1:$PUERTO/estado").openConnection() as HttpURLConnection
        c.connectTimeout = 1000; c.readTimeout = 2000
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(this))
        try { if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()).optJSONObject("lector")?.optInt("lecturas") ?: 0 else 0 } finally { c.disconnect() }
    } catch (e: Throwable) { 0 }

    private fun alternar() {
        if (Lector.grabando) startService(Intent(this, Lector::class.java).setAction(Lector.PARAR))
        else @Suppress("DEPRECATION") startActivityForResult(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent(), PEDIR_GRABAR)
    }

    @Deprecated("Activity sin AndroidX")
    override fun onActivityResult(peticion: Int, resultado: Int, datos: Intent?) {
        super.onActivityResult(peticion, resultado, datos)
        if (peticion != PEDIR_GRABAR || resultado != RESULT_OK || datos == null) return
        startForegroundService(Intent(this, Lector::class.java).setAction(Lector.EMPEZAR)
            .putExtra(Lector.CODIGO_RESULTADO, resultado).putExtra(Lector.DATOS, datos))
        // Y al juego (3.70.0), si está instalado y no lo has quitado abajo.
        if (getSharedPreferences("lector", MODE_PRIVATE).getBoolean("abrirJuego", true)) {
            packageManager.getLaunchIntentForPackage(JUEGO)?.let { reloj.postDelayed({ startActivity(it) }, 800) }
        }
    }

    private fun codigoNuevo() {
        Vinculo.nuevo(this)
        if (!Nodo.arrancado) { qrDe = null; refrescar(); return }
        startService(Intent(this, Lector::class.java).setAction(Lector.PARAR))
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        }
        Runtime.getRuntime().exit(0)
    }

    private fun ip(): String? {
        val red = getSystemService(ConnectivityManager::class.java)
        val enlace = red.getLinkProperties(red.activeNetwork) ?: return null
        return enlace.linkAddresses.map { it.address }.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
    }

    private fun refrescar() {
        val avisos = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        val bateria = getSystemService(android.os.PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        val burbuja = Settings.canDrawOverlays(this)
        val linea = Solo.linea(this)
        val hechos = listOf(avisos, bateria, burbuja, Lector.grabando, linea != null, movilLee, false)
        pasos.forEachIndexed { i, p -> p.marcar(hechos[i], i + 1) }
        // La línea elegida, marcada; sin ninguna, «Apagado».
        for (b in botonesLinea) { val es = b.tag == linea; b.text = (if (es) "✓ " else "") + Solo.nombre(b.tag as String); b.alpha = if (es) 1f else 0.7f }
        apagarSolo.text = if (linea == null) "✓ Apagado" else "Apagado"
        apagarSolo.alpha = if (linea == null) 1f else 0.7f

        nueva?.let { actualizar.text = if (Lector.grabando) "Hay una versión nueva (${it.version}): se instala sola cuando dejes de leer." else "Actualizando a la ${it.version}…"; actualizar.visibility = View.VISIBLE }
            ?: run { actualizar.visibility = View.GONE }

        val caida = java.io.File(filesDir, "fallo.txt").takeIf { it.exists() }?.readText()?.lines()?.take(6)?.joinToString("\n")
        val salida = ultimaSalida ?: Salidas.ultima(this).also { ultimaSalida = it }
        estado.text = listOfNotNull(Nodo.fallo, Lector.estado, salida, caida?.let { "La última vez se cerró por:\n$it" }).joinToString("\n\n")
        boton.text = if (Lector.grabando) "Parar de leer" else "Empezar a leer"
        esquinaBurbuja.text = "Burbuja con tu nº1: ${Burbuja.esquina(this)} (toca para cambiar) · ahora: ${Burbuja.estado}"

        val codigo = Vinculo.codigo(this)
        val dir = ip()
        vinculo.text = if (dir == null) "Sin wifi: conecta la tablet a la misma wifi que el móvil." else
            "Escanea el QR con la cámara del móvil.\nO a mano, en Pick Assist → Ajustes → Lector en la tablet:\nDirección  $dir\nCódigo     ${codigo.chunked(5).joinToString("-")}"
        val enlace = if (dir == null) null else "${APP}#lector=$dir:$PUERTO&codigo=$codigo"
        if (enlace != qrDe) {
            qrDe = enlace
            qr.setImageBitmap(enlace?.let { dibujarQr(it) })
        }
        val log = Nodo.registro(this)
        registro.text = if (log.exists()) log.readLines().takeLast(25).joinToString("\n") else "(el lector aún no ha arrancado: toca «Empezar a leer»)"
    }

    private fun dibujarQr(texto: String): Bitmap {
        val m = QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, 512, 512)
        val bmp = Bitmap.createBitmap(m.width, m.height, Bitmap.Config.RGB_565)
        for (x in 0 until m.width) for (y in 0 until m.height) bmp.setPixel(x, y, if (m[x, y]) Color.BLACK else Color.WHITE)
        return bmp
    }
}

/**
 * El modo «Sin móvil» (3.66.0): la línea elegida se guarda en `solo.json`, en
 * la casa de la app, y el lector (scripts/lector/solo.mjs) la lee en cada
 * vuelta: sin reiniciar nada. Sin línea, el modo está apagado.
 */
object Solo {
    val LINEAS = listOf("roam" to "Roam", "jungle" to "Jungla", "mid" to "Mid", "gold" to "Oro", "exp" to "Exp")
    fun nombre(clave: String) = LINEAS.firstOrNull { it.first == clave }?.second ?: clave
    private fun fichero(c: android.content.Context) = java.io.File(c.filesDir, "solo.json")
    fun linea(c: android.content.Context): String? = try {
        val j = JSONObject(fichero(c).readText())
        val l = j.optString("linea", "")
        if (j.optBoolean("activo", true) && LINEAS.any { it.first == l }) l else null
    } catch (e: Exception) { null }
    fun guardar(c: android.content.Context, linea: String?) {
        val j = if (linea == null) JSONObject().put("activo", false) else JSONObject().put("linea", linea).put("idioma", "es")
        val tmp = java.io.File(c.filesDir, "solo.json.tmp")
        tmp.writeText(j.toString())
        tmp.renameTo(fichero(c))
    }
}
