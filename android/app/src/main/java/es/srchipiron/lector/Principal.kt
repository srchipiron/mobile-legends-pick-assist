package es.srchipiron.lector

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
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
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import org.json.JSONArray
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

    /**
     * Hay una petición de grabar abierta (3.72.1). Sin esto, la petición sola
     * al abrir (que espera a mirar si hay versión nueva) y tu toque en
     * «Empezar a leer» sacaban DOS diálogos de Android, uno encima del otro;
     * pedir el segundo anula el permiso del primero y, al aceptar ese, Android
     * daba un error de seguridad que cerraba la app.
     */
    private var pidiendo = false

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
    /** «Enseña al lector» (3.71.0): lo que no reconoció en tu última partida. */
    private lateinit var corregir: LinearLayout
    /** «¿Cómo acabó?» (3.72.5): la tablet no reconoció el final de tu última partida. */
    private lateinit var preguntaCard: LinearLayout
    private var preguntaId: String? = null
    /** El aviso de un cierre (3.72.1), arriba del todo y con «Copiar». */
    private lateinit var aviso: LinearLayout
    private lateinit var avisoTexto: TextView
    private var avisoCompleto = ""
    private var correccionId: String? = null
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
        // Si la app se cerró por un fallo (3.72.1): lo primero que se ve, con el
        // detalle para copiarlo y pegarlo en el chat (sin ordenador no hay logcat).
        aviso = tarjeta().apply {
            visibility = View.GONE
            background = GradientDrawable().apply { setColor(Color.rgb(58, 18, 18)); cornerRadius = dp(14).toFloat(); setStroke(dp(2), Color.rgb(255, 69, 58)) }
        }
        aviso.addView(titulo("La app se cerró por un fallo").apply { setTextColor(Color.rgb(255, 105, 97)) })
        avisoTexto = texto(13f, Color.WHITE).apply { typeface = Typeface.MONOSPACE }.also { aviso.addView(it) }
        aviso.addView(texto(13f, Color.LTGRAY).apply { text = "No vuelvo a pedir grabar sola hasta que toques «Empezar a leer». Toca «Copiar» y pégalo en el chat para arreglarlo." })
        val filaAviso = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        filaAviso.addView(Button(this).apply {
            text = "Copiar"
            setOnClickListener {
                getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Fallo de Lector MLBB", avisoCompleto))
                text = "Copiado"
            }
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        filaAviso.addView(Button(this).apply {
            text = "Ya está"
            setOnClickListener { getSharedPreferences("lector", MODE_PRIVATE).edit().putLong("fallosVistos", System.currentTimeMillis()).apply(); aviso.visibility = View.GONE }
        }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        aviso.addView(filaAviso)
        izquierda.addView(aviso, separada())
        // Cómo acabó la partida (3.72.5), lo primero tras un fallo: sin eso la partida no se apunta.
        preguntaCard = tarjeta().apply { visibility = View.GONE }
        izquierda.addView(preguntaCard, separada())
        // Arriba del todo, donde se ve al abrir desde la notificación de la partida (3.71.0).
        corregir = tarjeta().apply { visibility = View.GONE }
        izquierda.addView(corregir, separada())

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
            Paso("(Opcional) Con Pick Assist en el MÓVIL: abre la cámara, escanea el QR y toca «Vincular» (misma wifi). Una vez basta: la tablet se queda con tu maestría y tu clave para subir las partidas."),
            Paso("Juega. En baneos la burbuja dice a quién banear; en picks, tu nº1 y los dos siguientes. En partida, la voz te da los consejos de tu pick, y al acabar la tablet apunta la partida."),
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
        // La voz en partida (3.71.0), sí por defecto: también se calla desde la app del móvil.
        fun textoVoz() = "Voz en partida: ${if (Solo.voz(this)) "sí" else "callada"} (toca para cambiar)"
        ajustes.addView(Button(this).apply {
            text = textoVoz()
            setOnClickListener { Solo.ponerVoz(this@Principal, !Solo.voz(this@Principal)); text = textoVoz() }
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
            val fallo = falloSinVer()
            runOnUiThread {
                refrescar()
                pintarAviso(fallo)
                // Abrir y jugar (3.70.0): sin versión nueva que instalar, pide grabar
                // nada más abrir (Android exige ese toque cada vez) y luego abre el juego.
                // Con un fallo sin ver, NO (3.72.1): si el fallo es al empezar a grabar,
                // pedirlo solo era un bucle de abrir y cerrarse.
                if (n == null && fallo == null && !Lector.grabando && !pedidoAlAbrir && !isFinishing) { pedidoAlAbrir = true; alternar() }
            }
        }
    }

    override fun onPause() { reloj.removeCallbacksAndMessages(null); super.onPause() }

    private fun tic() {
        refrescar()
        // ¿El móvil ya lee? Lo dice el propio lector (sus lecturas), cada 3 s.
        if (Nodo.arrancado && System.currentTimeMillis() / 1000 % 3 == 0L) thread(isDaemon = true) {
            movilLee = lecturasDelLector() > 0
            val c = pedirCorreccion()
            val p = pedir("/pregunta")?.optJSONObject("pregunta")
            // Un fallo al empezar a grabar no cierra la app (3.72.1): el aviso sale sin tener que volver a abrirla.
            val f = falloSinVer()
            runOnUiThread { if (!isFinishing) { pintarCorreccion(c); pintarPregunta(p); pintarAviso(f) } }
        }
        reloj.postDelayed({ tic() }, 1000)
    }

    private fun lecturasDelLector(): Int = try {
        val c = URL("http://127.0.0.1:$PUERTO/estado").openConnection() as HttpURLConnection
        c.connectTimeout = 1000; c.readTimeout = 2000
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(this))
        try { if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()).optJSONObject("lector")?.optInt("lecturas") ?: 0 else 0 } finally { c.disconnect() }
    } catch (e: Throwable) { 0 }

    /** Lo que no reconoció (3.71.0), o null. Solo lo da a la propia tablet: por 127.0.0.1 y con el código. */
    private fun pedirCorreccion(): JSONObject? = try {
        val c = URL("http://127.0.0.1:$PUERTO/correccion").openConnection() as HttpURLConnection
        c.connectTimeout = 1000; c.readTimeout = 2000
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(this))
        try { if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()).optJSONObject("correccion") else null } finally { c.disconnect() }
    } catch (e: Throwable) { null }

    /** GET al lector de la propia tablet (127.0.0.1, con el código); null si no contesta 200. */
    private fun pedir(ruta: String): JSONObject? = try {
        val c = URL("http://127.0.0.1:$PUERTO$ruta").openConnection() as HttpURLConnection
        c.connectTimeout = 1000; c.readTimeout = 2000
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(this))
        try { if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()) else null } finally { c.disconnect() }
    } catch (e: Throwable) { null }

    /** POST al lector de la propia tablet; el código HTTP, o 0 si no contesta. */
    private fun mandar(ruta: String, cuerpo: JSONObject): Int = try {
        val c = URL("http://127.0.0.1:$PUERTO$ruta").openConnection() as HttpURLConnection
        c.connectTimeout = 2000; c.readTimeout = 20000
        c.requestMethod = "POST"; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(this))
        c.outputStream.use { it.write(cuerpo.toString().toByteArray()) }
        try { c.responseCode } finally { c.disconnect() }
    } catch (e: Throwable) { 0 }

    /**
     * «¿Cómo acabó?» (3.72.5): la tablet no reconoció el final (la victoria se
     * aprende, o no salió la tabla). Con tu respuesta apunta la partida y
     * aprende la pantalla de la tabla, así la próxima la reconoce sola.
     */
    private fun pintarPregunta(p: JSONObject?) {
        if (p == null) { if (preguntaId != null) { preguntaId = null; preguntaCard.visibility = View.GONE }; return }
        val id = p.optString("id")
        if (id == preguntaId) return
        preguntaId = id
        preguntaCard.removeAllViews()
        val pick = p.optString("pick", "").takeIf { it.isNotEmpty() && it != "null" }
        preguntaCard.addView(TextView(this).apply { text = "¿Cómo acabó tu partida${pick?.let { " con $it" } ?: ""}?"; textSize = 18f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.rgb(255, 214, 10)) })
        preguntaCard.addView(TextView(this).apply {
            text = "No vi el resultado. Dímelo y la apunto; si salió la tabla del final, aprendo a reconocerla para la próxima."
            textSize = 14f; setTextColor(Color.LTGRAY); setPadding(0, dp(4), 0, dp(8))
        })
        val aviso = TextView(this).apply { textSize = 14f; setTextColor(Color.WHITE); setPadding(0, dp(6), 0, 0) }
        val fila = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val botones = listOf("Gané" to true, "Perdí" to false, "No la terminé" to null).map { (texto, gane) ->
            Button(this).apply { text = texto }.also { fila.addView(it, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)) } to gane
        }
        for ((b, gane) in botones) b.setOnClickListener {
            botones.forEach { it.first.isEnabled = false }
            thread(isDaemon = true) {
                val estado = mandar("/pregunta", JSONObject().put("id", id).put("gane", gane ?: JSONObject.NULL))
                runOnUiThread {
                    aviso.text = when (estado) {
                        200 -> if (gane == null) "Vale: esa partida no se apunta." else "Apuntada como ${if (gane) "ganada" else "perdida"}."
                        409 -> "Esa partida ya no se puede contestar."
                        else -> { botones.forEach { it.first.isEnabled = true }; "El lector no contestó: ¿está leyendo? Prueba otra vez." }
                    }
                }
            }
        }
        preguntaCard.addView(fila)
        preguntaCard.addView(aviso)
        preguntaCard.visibility = View.VISIBLE
    }

    private fun mandarCorreccion(cuerpo: JSONObject): JSONObject? = try {
        val c = URL("http://127.0.0.1:$PUERTO/correccion").openConnection() as HttpURLConnection
        // Aprender lleva unas decenas de segundos por captura.
        c.connectTimeout = 2000; c.readTimeout = 180000
        c.requestMethod = "POST"; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(this))
        c.outputStream.use { it.write(cuerpo.toString().toByteArray()) }
        try { JSONObject().put("estado", c.responseCode).put("r", if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()) else JSONObject()) } finally { c.disconnect() }
    } catch (e: Throwable) { null }

    /**
     * La tarjeta «Enseña al lector» (3.71.0): los huecos de tu última partida,
     * con lo que sí leyó ya puesto. Escribes quién era el que falta, tocas
     * «Enseñar» y el lector aprende de las capturas del draft como de una
     * corrección del móvil. Solo se rehace si llega otra corrección (lo que
     * estás escribiendo no se borra).
     */
    private fun pintarCorreccion(c: JSONObject?) {
        if (c == null) { if (correccionId != null) { correccionId = null; corregir.visibility = View.GONE }; return }
        val id = c.optString("id")
        if (id == correccionId) return
        correccionId = id
        corregir.removeAllViews()
        val heroes = c.optJSONArray("heroes")?.let { a -> List(a.length()) { a.optString(it) } } ?: emptyList()
        val leidos = c.optJSONObject("leidos") ?: JSONObject()
        val tuyoFila = leidos.optInt("tuyoFila", -1)
        fun nombre(a: JSONArray?, i: Int) = a?.optString(i, "")?.takeIf { it.isNotEmpty() && it != "null" } ?: ""
        fun campo(valor: String, pista: String) = AutoCompleteTextView(this).apply {
            setText(valor); hint = pista; threshold = 1; textSize = 16f; setSingleLine()
            setAdapter(ArrayAdapter(this@Principal, android.R.layout.simple_dropdown_item_1line, heroes))
        }
        corregir.addView(TextView(this).apply { text = "Enseña al lector"; textSize = 18f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.rgb(255, 214, 10)) })
        corregir.addView(TextView(this).apply {
            text = "En tu última partida no reconoció a todos. Escribe quién era el que falta (lo que sí leyó ya está puesto) y toca «Enseñar»: aprende de las capturas de ese draft y la próxima vez lo reconoce."
            textSize = 14f; setTextColor(Color.LTGRAY); setPadding(0, dp(4), 0, dp(8))
        })
        corregir.addView(TextView(this).apply { text = "Enemigos"; textSize = 15f; setTextColor(Color.rgb(255, 69, 58)) })
        val enemigos = List(5) { i -> campo(nombre(leidos.optJSONArray("enemigos"), i), "Enemigo ${i + 1}").also { corregir.addView(it) } }
        corregir.addView(TextView(this).apply { text = "Tu equipo"; textSize = 15f; setTextColor(Color.rgb(10, 132, 255)); setPadding(0, dp(8), 0, 0) })
        // Sin tu fila leída no se sabe cuál de los cinco eras tú: cuatro compañeros con lo leído y «Tú» aparte, vacío.
        val sinFila = tuyoFila !in 0..4
        val leidosAliados = leidos.optJSONArray("aliados")
        val iniciales = if (sinFila) List(5) { nombre(leidosAliados, it) }.filter { it.isNotEmpty() }.take(4).let { it + List(5 - it.size) { "" } }.take(4) + "" else List(5) { nombre(leidosAliados, it) }
        val filaTuya = if (sinFila) 4 else tuyoFila
        val aliados = List(5) { i -> campo(iniciales[i], if (i == filaTuya) "Tú" else "Compañero ${i + 1}").also { corregir.addView(it) } }
        val aviso = TextView(this).apply { textSize = 14f; setTextColor(Color.WHITE); setPadding(0, dp(6), 0, 0) }
        val ensenar = Button(this).apply { text = "Enseñar" }
        val ahoraNo = Button(this).apply { text = "Ahora no" }
        val porNombre = heroes.associateBy { it.lowercase() }
        ensenar.setOnClickListener {
            val raros = (enemigos + aliados).map { it.text.toString().trim() }.filter { it.isNotEmpty() && porNombre[it.lowercase()] == null }
            if (raros.isNotEmpty()) { aviso.text = "No conozco a: ${raros.joinToString(", ")}. Elige el nombre de la lista."; return@setOnClickListener }
            val de = { v: AutoCompleteTextView -> porNombre[v.text.toString().trim().lowercase()] }
            val cuerpo = JSONObject().put("id", id)
                .put("enemigos", JSONArray(enemigos.mapNotNull(de)))
                .put("aliados", JSONArray(aliados.filterIndexed { i, _ -> i != filaTuya }.mapNotNull(de)))
            de(aliados[filaTuya])?.let { cuerpo.put("tuyo", it) }
            ensenar.isEnabled = false; ahoraNo.isEnabled = false
            aviso.text = "Aprendiendo de las capturas… (puede tardar un minuto)"
            thread(isDaemon = true) {
                val r = mandarCorreccion(cuerpo)
                runOnUiThread {
                    val estado = r?.optInt("estado") ?: 0
                    val res = r?.optJSONObject("r")
                    aviso.text = when (estado) {
                        200 -> {
                            val ap = res?.optJSONArray("aprendidos")?.let { a -> List(a.length()) { a.optString(it) } }.orEmpty()
                            val no = res?.optJSONArray("sinEncontrar")?.let { a -> List(a.length()) { a.optString(it) } }.orEmpty()
                            listOfNotNull(
                                if (ap.isNotEmpty()) "Aprendido: ${ap.joinToString(", ")}." else "Gracias: la partida queda corregida.",
                                if (no.isNotEmpty()) "No los encontré en las capturas: ${no.joinToString(", ")} (se intenta otra vez cuando vuelvan a salir)." else null,
                            ).joinToString(" ")
                        }
                        400 -> { ensenar.isEnabled = true; ahoraNo.isEnabled = true; "Revisa los nombres: hay uno repetido o falta algún enemigo." }
                        409 -> "Esa partida ya no se puede corregir (pasó mucho tiempo)."
                        else -> { ensenar.isEnabled = true; ahoraNo.isEnabled = true; "El lector no contestó: ¿está leyendo? Prueba otra vez." }
                    }
                }
            }
        }
        ahoraNo.setOnClickListener {
            corregir.visibility = View.GONE
            thread(isDaemon = true) { mandarCorreccion(JSONObject().put("id", id).put("descartar", true)) }
        }
        val botones = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        botones.addView(ensenar, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        botones.addView(ahoraNo, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        corregir.addView(botones)
        corregir.addView(aviso)
        corregir.visibility = View.VISIBLE
    }

    /**
     * Lo que falló desde la última vez que tocaste «Ya está» (3.72.1): el
     * cierre que apunta Android, la excepción de la app (fallo.txt), la de
     * empezar a grabar (fallo-grabar.txt) y si Node se paró. null si nada.
     */
    private fun falloSinVer(): String? {
        val visto = getSharedPreferences("lector", MODE_PRIVATE).getLong("fallosVistos", 0)
        fun fichero(n: String) = java.io.File(filesDir, n).takeIf { it.exists() && it.lastModified() > visto }?.readText()?.trim()
        val partes = listOfNotNull(
            Salidas.falloDesde(this, visto)?.let { "Android: $it" },
            fichero("salida-nodo.txt"),
            fichero("fallo-nodo.txt")?.let { "En el lector:\n$it" },
            fichero("fallo-grabar.txt")?.let { "Al empezar a grabar:\n$it" },
            fichero("fallo.txt")?.let { "En la app:\n$it" },
        )
        if (partes.isEmpty()) return null
        val version = try { packageManager.getPackageInfo(packageName, 0).versionName } catch (e: Exception) { "?" }
        // Y lo último del registro del lector (3.72.2): ahí está lo que pasó justo antes.
        val log = Nodo.registro(this).takeIf { it.exists() }?.readLines()?.takeLast(40)?.joinToString("\n")
        return (listOf("Lector MLBB $version · Android ${Build.VERSION.SDK_INT} · ${Build.MANUFACTURER} ${Build.MODEL}") + partes + listOfNotNull(log?.let { "Últimas líneas del lector:\n$it" })).joinToString("\n\n")
    }

    private fun pintarAviso(fallo: String?) {
        if (fallo == null) { aviso.visibility = View.GONE; return }
        avisoCompleto = fallo
        // En pantalla, lo justo; «Copiar» lleva el detalle entero.
        avisoTexto.text = fallo.substringBefore("Últimas líneas del lector:").lines().take(12).joinToString("\n").trim()
        aviso.visibility = View.VISIBLE
    }

    private fun alternar() {
        if (Lector.grabando) { startService(Intent(this, Lector::class.java).setAction(Lector.PARAR)); return }
        if (pidiendo) return
        pidiendo = true
        @Suppress("DEPRECATION") startActivityForResult(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent(), PEDIR_GRABAR)
    }

    @Deprecated("Activity sin AndroidX")
    override fun onActivityResult(peticion: Int, resultado: Int, datos: Intent?) {
        super.onActivityResult(peticion, resultado, datos)
        if (peticion == PEDIR_GRABAR) pidiendo = false
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
    private fun leer(c: android.content.Context) = try { JSONObject(fichero(c).readText()) } catch (e: Exception) { JSONObject() }
    private fun escribir(c: android.content.Context, j: JSONObject) {
        val tmp = java.io.File(c.filesDir, "solo.json.tmp")
        tmp.writeText(j.toString())
        tmp.renameTo(fichero(c))
    }
    fun guardar(c: android.content.Context, linea: String?) {
        val j = if (linea == null) JSONObject().put("activo", false) else JSONObject().put("linea", linea).put("idioma", "es")
        // La voz (3.71.0) se conserva al cambiar de línea.
        if (!voz(c)) j.put("voz", false)
        escribir(c, j)
    }
    /** «Voz en partida» (3.71.0): sin el campo, habla. */
    fun voz(c: android.content.Context) = leer(c).optBoolean("voz", true)
    fun ponerVoz(c: android.content.Context, si: Boolean) = escribir(c, leer(c).apply { if (si) remove("voz") else put("voz", false) })
}
