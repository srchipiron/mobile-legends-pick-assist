package es.srchipiron.lector

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.media.projection.MediaProjectionManager
import android.net.ConnectivityManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.net.Inet4Address
import kotlin.concurrent.thread

/**
 * La pantalla de la app en la tablet: un botón para empezar a leer, la
 * dirección y el código para el móvil (con un QR que abre la app del móvil
 * ya vinculada) y las últimas líneas del lector, para saber qué pasa.
 */
class Principal : Activity() {
    companion object {
        const val PUERTO = 47323
        const val APP = "https://srchipiron.github.io/mobile-legends-pick-assist/"
        private const val PEDIR_GRABAR = 7
    }

    private lateinit var estado: TextView
    private lateinit var vinculo: TextView
    private lateinit var qr: ImageView
    private lateinit var boton: Button
    private lateinit var bateria: Button
    private lateinit var permisoBurbuja: Button
    private lateinit var esquinaBurbuja: Button
    private lateinit var actualizar: Button
    @Volatile private var nueva: Actualizar.Nueva? = null
    private lateinit var registro: TextView
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
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        val pad = (16 * resources.displayMetrics.density).toInt()
        val columna = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad); setBackgroundColor(Color.BLACK) }
        fun texto(tam: Float, color: Int = Color.WHITE) = TextView(this).apply { textSize = tam; setTextColor(color); setPadding(0, pad / 3, 0, pad / 3) }
        columna.addView(texto(24f, Color.rgb(255, 214, 10)).apply { text = "Lector MLBB"; typeface = Typeface.DEFAULT_BOLD })
        estado = texto(16f).also { columna.addView(it) }
        boton = Button(this).apply { textSize = 18f; setOnClickListener { alternar() } }
        columna.addView(boton)
        // El ahorro de batería puede cerrar la app con el juego delante (3.61.5): se pide quitarlo, una vez.
        bateria = Button(this).apply {
            text = "Que el ahorro de batería no la cierre"
            setOnClickListener {
                @Suppress("BatteryLife")
                startActivity(Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, android.net.Uri.parse("package:$packageName")))
            }
        }
        columna.addView(bateria)
        // La burbuja sobre el juego (3.62.0): el permiso, y en qué esquina va (o ninguna).
        permisoBurbuja = Button(this).apply {
            text = "Permitir la burbuja sobre el juego"
            setOnClickListener { startActivity(Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, android.net.Uri.parse("package:$packageName"))) }
        }
        columna.addView(permisoBurbuja)
        esquinaBurbuja = Button(this).apply { setOnClickListener { Burbuja.siguienteEsquina(this@Principal); refrescar() } }
        columna.addView(esquinaBurbuja)
        // Actualizarse sola (3.62.0): sale solo si hay una versión más nueva publicada.
        actualizar = Button(this).apply { visibility = android.view.View.GONE; setOnClickListener { instalarNueva() } }
        columna.addView(actualizar)
        vinculo = texto(18f).apply { typeface = Typeface.MONOSPACE }.also { columna.addView(it) }
        qr = ImageView(this).apply { adjustViewBounds = true }
        columna.addView(qr, LinearLayout.LayoutParams((240 * resources.displayMetrics.density).toInt(), (240 * resources.displayMetrics.density).toInt()).apply { gravity = Gravity.START })
        // Un código nuevo invalida el viejo: Node lo leyó al arrancar, así que
        // la app se cierra y se vuelve a abrir con el nuevo (Node no se reinicia en el mismo proceso).
        columna.addView(Button(this).apply { text = "Código nuevo"; setOnClickListener { codigoNuevo() } })
        columna.addView(texto(13f, Color.LTGRAY).apply { text = "Mientras lee, la tablet graba su pantalla: si abres otra app, el lector también la ve. Las pantallas del final de la partida se suben a tu proyecto." })
        columna.addView(texto(14f, Color.LTGRAY).apply { text = "Últimas líneas del lector:" })
        registro = texto(12f, Color.LTGRAY).apply { typeface = Typeface.MONOSPACE }.also { columna.addView(it) }
        setContentView(ScrollView(this).apply { addView(columna); setBackgroundColor(Color.BLACK) })
    }

    override fun onResume() {
        super.onResume()
        tic()
        thread(isDaemon = true) { val n = try { Actualizar.buscar(this) } catch (e: Throwable) { null }; nueva = n; runOnUiThread { refrescar() } }
    }

    private fun instalarNueva() {
        val n = nueva ?: return
        actualizar.isEnabled = false
        actualizar.text = "Descargando la ${n.version}…"
        thread(isDaemon = true) {
            try { Actualizar.instalar(this, n) } catch (e: Throwable) { runOnUiThread { Actualizar.enNavegador(this) } }
            runOnUiThread { actualizar.isEnabled = true }
        }
    }
    override fun onPause() { reloj.removeCallbacksAndMessages(null); super.onPause() }

    private fun tic() { refrescar(); reloj.postDelayed({ tic() }, 1000) }

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
        val caida = java.io.File(filesDir, "fallo.txt").takeIf { it.exists() }?.readText()?.lines()?.take(6)?.joinToString("\n")
        val salida = ultimaSalida ?: Salidas.ultima(this).also { ultimaSalida = it }
        estado.text = listOfNotNull(Nodo.fallo, Lector.estado, salida, caida?.let { "La última vez se cerró por:\n$it" }).joinToString("\n\n")
        boton.text = if (Lector.grabando) "Parar" else "Empezar a leer"
        permisoBurbuja.visibility = if (android.provider.Settings.canDrawOverlays(this)) android.view.View.GONE else android.view.View.VISIBLE
        esquinaBurbuja.text = "Burbuja con tu nº1: ${Burbuja.esquina(this)}"
        nueva?.let { if (actualizar.isEnabled) { actualizar.text = "Actualizar a la ${it.version}"; actualizar.visibility = android.view.View.VISIBLE } } ?: run { actualizar.visibility = android.view.View.GONE }
        bateria.visibility = if (getSystemService(android.os.PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)) android.view.View.GONE else android.view.View.VISIBLE
        val codigo = Vinculo.codigo(this)
        val dir = ip()
        vinculo.text = if (dir == null) "Sin wifi: conecta la tablet a la misma wifi que el móvil." else
            "En el móvil, escanea el QR con la cámara.\nO a mano, en la app → Ajustes → Lector en la tablet:\nDirección  $dir\nCódigo     ${codigo.chunked(5).joinToString("-")}"
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
