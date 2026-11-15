package es.srchipiron.lector

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.projection.MediaProjectionManager
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
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * La pantalla de la app en la tablet: arriba el estado (si lee) con el botón
 * de empezar, lo que la tablet no supo (`Contestar`) y el aviso de un fallo;
 * luego una GUÍA paso a paso que se marca sola, «Sin móvil», vincular el
 * móvil y los detalles. Lo que habla con el lector va por `Cliente`.
 */
class Principal : Activity() {
    companion object {
        private const val PEDIR_GRABAR = 7
        /** Mobile Legends: se abre solo al empezar a leer. Solo se abre: nada lo toca. */
        const val JUEGO = "com.mobile.legends"
    }

    /** Ya se pidió grabar al abrir esta pantalla: si dices que no, no se vuelve a pedir en bucle. */
    private var pedidoAlAbrir = false

    /**
     * Hay una petición de grabar abierta: la sola al abrir y tu toque en
     * «Empezar a leer» sacaban DOS diálogos; pedir el segundo anula el permiso
     * del primero y Android daba un error de seguridad que cerraba la app.
     */
    private var pidiendo = false

    /** Un paso de la guía: su marca, su texto y, si hace falta, su botón. */
    private inner class Paso(val texto: String, boton: String? = null, accion: (() -> Unit)? = null) {
        // El número en un círculo que se vuelve verde con ✓ al hacerse.
        val fila = LinearLayout(this@Principal).apply { orientation = LinearLayout.HORIZONTAL; isBaselineAligned = false; setPadding(0, dp(8), 0, dp(8)) }
        val marca = circulo()
        val columna = LinearLayout(this@Principal).apply { orientation = LinearLayout.VERTICAL }
        val linea = TextView(this@Principal).apply { textSize = 15f; setTextColor(Estilo.TEXTO); setLineSpacing(0f, 1.15f) }
        val btn = boton?.let { pildora(it) { accion?.invoke() } }
        init {
            fila.addView(marca, LinearLayout.LayoutParams(dp(30), dp(30)).apply { marginEnd = dp(12); topMargin = dp(1) })
            columna.addView(linea)
            btn?.let { columna.addView(it, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(8) }) }
            fila.addView(columna, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        fun marcar(hecho: Boolean, n: Int) {
            marcarCirculo(marca, hecho, n)
            linea.text = texto
            linea.setTextColor(if (hecho) Estilo.TENUE else Estilo.TEXTO)
            btn?.visibility = if (hecho) View.GONE else View.VISIBLE
        }
    }

    private fun dp(x: Int) = (x * resources.displayMetrics.density).toInt()

    private lateinit var estado: TextView
    /** La tarjeta de arriba: si lee o no, con el botón grande de empezar. */
    private lateinit var estadoCard: LinearLayout
    private lateinit var estadoTitulo: TextView
    private lateinit var estadoDetalle: TextView
    private lateinit var vinculo: TextView
    private lateinit var qr: ImageView
    private lateinit var boton: Button
    private lateinit var esquinaBurbuja: Button
    private lateinit var actualizar: TextView
    private lateinit var registro: TextView
    private lateinit var pasos: List<Paso>
    private lateinit var botonesLinea: List<Button>
    private lateinit var apagarSolo: Button
    /** «Enseña al lector»: lo que no reconoció en tu última partida. */
    private lateinit var corregir: LinearLayout
    /** «¿Cómo acabó?»: la tablet no reconoció el final de tu última partida. */
    private lateinit var preguntaCard: LinearLayout
    private var preguntaId: String? = null
    /** El aviso de un cierre, arriba del todo y con «Copiar». */
    private lateinit var aviso: LinearLayout
    private lateinit var avisoTexto: TextView
    private var avisoCompleto = ""
    private var correccionId: String? = null
    @Volatile private var nueva: Actualizar.Nueva? = null
    @Volatile private var movilLee = false
    /** De cuándo son los datos y si suben las partidas, de /estado. */
    private lateinit var cuentaTablet: TextView
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
        // guía a un lado y el QR y los ajustes al otro. En vertical, una.
        val dosColumnas = resources.configuration.screenWidthDp >= 720
        fun texto(tam: Float, color: Int = Estilo.TEXTO) = TextView(this).apply { textSize = tam; setTextColor(color); setPadding(0, pad / 3, 0, pad / 3); setLineSpacing(0f, 1.15f) }
        fun titulo(t: String) = texto(19f, Estilo.TEXTO).apply { text = t; typeface = Typeface.create("sans-serif", Typeface.BOLD); setPadding(0, 0, 0, pad / 2); letterSpacing = -0.01f }
        /** Una tarjeta como las de Pick Assist: gris sobre negro, con la arista de luz y un poco de degradado. */
        fun tarjeta() = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad + dp(2), pad + dp(2), pad + dp(2), pad + dp(2))
            background = fondo(Estilo.TARJETA_ALTA, Estilo.TARJETA, radio = 20)
        }
        fun separada() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) }
        val izquierda = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val derecha = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        // La cabecera: el sello dorado, el nombre y la versión instalada (para saber si está al día).
        val instalada = try { packageManager.getPackageInfo(packageName, 0).versionName } catch (e: Exception) { null }
        val cabecera = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; isBaselineAligned = false; gravity = Gravity.CENTER_VERTICAL; setPadding(0, dp(4), 0, pad) }
        cabecera.addView(TextView(this).apply {
            text = "L"; textSize = 28f; typeface = Typeface.create("sans-serif-black", Typeface.NORMAL); gravity = Gravity.CENTER; setTextColor(Color.rgb(32, 24, 0))
            background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Estilo.ORO_CLARO, Estilo.ORO, Estilo.ORO_OSCURO)).apply { cornerRadius = dp(16).toFloat() }
        }, LinearLayout.LayoutParams(dp(52), dp(52)).apply { marginEnd = dp(14) })
        val nombreApp = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        nombreApp.addView(TextView(this).apply { text = "Lector MLBB"; textSize = 28f; typeface = Typeface.create("sans-serif", Typeface.BOLD); setTextColor(Estilo.TEXTO); letterSpacing = -0.02f })
        nombreApp.addView(TextView(this).apply { text = listOfNotNull(instalada?.let { "Versión $it" }, "Pick Assist en la tablet").joinToString(" · "); textSize = 13f; setTextColor(Estilo.TENUE) })
        cabecera.addView(nombreApp)
        izquierda.addView(cabecera)
        // El estado, lo primero: si está leyendo o no, y el botón grande para empezar o parar.
        estadoCard = tarjeta()
        estadoTitulo = TextView(this).apply { textSize = 22f; typeface = Typeface.create("sans-serif", Typeface.BOLD) }
        estadoDetalle = TextView(this).apply { textSize = 14f; setTextColor(Estilo.TENUE); setPadding(0, dp(4), 0, dp(12)); setLineSpacing(0f, 1.15f) }
        estadoCard.addView(estadoTitulo)
        estadoCard.addView(estadoDetalle)
        boton = pildora("Empezar a leer", Estilo.Tipo.PRINCIPAL) { alternar() }
        estadoCard.addView(boton, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        izquierda.addView(texto(14f, Estilo.TENUE).apply {
            text = "Lee el draft de Mobile Legends de la pantalla de esta tablet, te dice qué héroe coger en la burbuja y apunta tus partidas. Ábrela, acepta grabar y juega: no hace falta el móvil. " +
                "Solo MIRA la pantalla: no toca el juego ni tu cuenta. Aun así, es una herramienta de terceros: úsala bajo tu responsabilidad."
            setPadding(0, 0, 0, pad)
        })
        // La guía completa y tus partidas, a la vista.
        val atajos = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; isBaselineAligned = false; setPadding(0, 0, 0, pad / 2) }
        atajos.addView(pildora("Guía completa") { startActivity(Intent(this@Principal, Guia::class.java)) }, repartido())
        atajos.addView(pildora("Mis partidas") { startActivity(Intent(this@Principal, Partidas::class.java)) }, repartido())
        izquierda.addView(atajos)
        actualizar = texto(14f, Color.rgb(100, 210, 255)).apply { visibility = View.GONE }
        izquierda.addView(actualizar)
        // Si la app se cerró por un fallo: lo primero que se ve, con el detalle
        // para copiarlo y pegarlo en el chat (sin ordenador no hay logcat).
        aviso = tarjeta().apply {
            visibility = View.GONE
            background = fondo(Color.rgb(70, 20, 20), Color.rgb(44, 14, 14), radio = 20, arista = Estilo.ROJO, grosor = 2)
        }
        aviso.addView(titulo("La app se cerró por un fallo").apply { setTextColor(Color.rgb(255, 105, 97)) })
        avisoTexto = texto(13f, Color.WHITE).apply { typeface = Typeface.MONOSPACE }.also { aviso.addView(it) }
        aviso.addView(texto(13f, Color.LTGRAY).apply { text = "No vuelvo a pedir grabar sola hasta que toques «Empezar a leer». Toca «Copiar» y pégalo en el chat para arreglarlo." })
        val filaAviso = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; isBaselineAligned = false }
        filaAviso.addView(pildora("Copiar", Estilo.Tipo.PELIGRO).apply {
            setOnClickListener {
                getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Fallo de Lector MLBB", avisoCompleto))
                text = "Copiado"
            }
        }, repartido())
        filaAviso.addView(pildora("Ya está") {
            getSharedPreferences("lector", MODE_PRIVATE).edit().putLong("fallosVistos", System.currentTimeMillis()).apply(); aviso.visibility = View.GONE
        }, repartido())
        aviso.addView(filaAviso)
        izquierda.addView(aviso, separada())
        // Cómo acabó la partida, lo primero tras un fallo: sin eso la partida no se apunta.
        preguntaCard = tarjeta().apply { visibility = View.GONE }
        izquierda.addView(preguntaCard, separada())
        // Arriba del todo, donde se ve al abrir desde la notificación de la partida.
        corregir = tarjeta().apply { visibility = View.GONE }
        izquierda.addView(corregir, separada())
        izquierda.addView(estadoCard, separada())

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
            Paso("Tus partidas se guardan solas en la base de datos: míralas y arréglalas en «Mis partidas». (Opcional) Con Pick Assist en el MÓVIL: escanea el QR de «Vincular el móvil» y toca «Vincular» (misma wifi): el móvil copia el draft de la tablet y lo que corrijas allí manda."),
            Paso("Juega. En baneos la burbuja dice a quién banear; en picks, tu nº1 y los dos siguientes. Al acabar, la tablet apunta la partida."),
        )
        for (p in pasos) guia.addView(p.fila)
        izquierda.addView(guia, separada())

        // La tablet decide sola con la línea elegida (o la del móvil).
        val sinMovil = tarjeta()
        sinMovil.addView(titulo("Sin móvil"))
        sinMovil.addView(texto(14f, Color.LTGRAY).apply { text = "Elige tu línea y la tablet decide sola, con los mismos datos que Pick Assist: en baneos, a quién banear; en picks, tu nº1 o tu build. Sin elegir aquí, vale la línea de Pick Assist del móvil vinculado." })
        val filaLineas = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; isBaselineAligned = false }
        val filaLineas2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; isBaselineAligned = false }
        botonesLinea = Solo.LINEAS.mapIndexed { i, (clave, nombre) ->
            pildora(nombre) { Solo.guardar(this@Principal, clave); refrescar() }.apply { tag = clave }
                .also { (if (i < 3) filaLineas else filaLineas2).addView(it, repartido()) }
        }
        apagarSolo = pildora("Apagado") { Solo.guardar(this@Principal, null); refrescar() }
        filaLineas2.addView(apagarSolo, repartido())
        sinMovil.addView(filaLineas)
        sinMovil.addView(filaLineas2)
        cuentaTablet = texto(14f, Color.LTGRAY).also { sinMovil.addView(it) }
        derecha.addView(sinMovil, separada())

        val enlazar = tarjeta()
        enlazar.addView(titulo("Vincular el móvil"))
        vinculo = texto(16f).apply { typeface = Typeface.MONOSPACE }.also { enlazar.addView(it) }
        qr = ImageView(this).apply { adjustViewBounds = true; setPadding(dp(10), dp(10), dp(10), dp(10)); background = fondo(Color.WHITE, radio = 16, grosor = 0) }
        enlazar.addView(qr, LinearLayout.LayoutParams(dp(240), dp(240)).apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = dp(8); bottomMargin = dp(8) })
        // Un código nuevo invalida el viejo: Node lo leyó al arrancar, así que
        // la app se cierra y se vuelve a abrir con el nuevo (Node no se reinicia en el mismo proceso).
        enlazar.addView(pildora("Código nuevo (desvincula el móvil)") { codigoNuevo() }, ancho())
        derecha.addView(enlazar, separada())

        val ajustes = tarjeta()
        ajustes.addView(titulo("Ajustes y detalles"))
        esquinaBurbuja = pildora("") { Burbuja.siguienteEsquina(this@Principal); refrescar() }
        ajustes.addView(esquinaBurbuja, ancho())
        // Abrir el juego al empezar a leer, sí por defecto.
        val prefs = getSharedPreferences("lector", MODE_PRIVATE)
        fun textoJuego() = "Abrir Mobile Legends al empezar: ${if (prefs.getBoolean("abrirJuego", true)) "sí" else "no"} (toca para cambiar)"
        ajustes.addView(pildora(textoJuego()).apply {
            setOnClickListener { prefs.edit().putBoolean("abrirJuego", !prefs.getBoolean("abrirJuego", true)).apply(); text = textoJuego() }
        }, ancho())
        estado = texto(14f).also { ajustes.addView(it) }
        ajustes.addView(texto(13f, Color.LTGRAY).apply { text = "Mientras lee, la tablet graba su pantalla: si abres otra app, el lector también la ve. La grabación no sale de la tablet; al móvil solo van nombres de héroes." })
        ajustes.addView(texto(14f, Color.LTGRAY).apply { text = "Últimas líneas del lector:" })
        registro = texto(11f, Estilo.TENUE).apply { typeface = Typeface.MONOSPACE; setPadding(dp(12), dp(10), dp(12), dp(10)); background = fondo(Color.rgb(12, 12, 13), radio = 12) }.also { ajustes.addView(it) }
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
        // Desde Android 15 la app se dibuja DEBAJO de las barras del sistema
        // (edge-to-edge con targetSdk 35): sin este margen se tapaban las primeras frases.
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
        // La primera vez, la guía entera.
        if (guardado == null && !getSharedPreferences("lector", MODE_PRIVATE).getBoolean("guiaVista", false)) startActivity(Intent(this, Guia::class.java))
    }

    override fun onResume() {
        super.onResume()
        tic()
        // Se actualiza sola: si hay una más nueva y no está leyendo, la instala.
        thread(isDaemon = true) {
            val n = try { Actualizar.sola(this) } catch (e: Throwable) { null }
            nueva = n
            val fallo = Fallos.sinVer(this)
            runOnUiThread {
                refrescar()
                pintarAviso(fallo)
                // Abrir y jugar: sin versión nueva que instalar, pide grabar nada más
                // abrir (Android exige ese toque cada vez) y luego abre el juego. Con un
                // fallo sin ver, NO: si el fallo es al empezar a grabar, sería un bucle.
                if (n == null && fallo == null && !Lector.grabando && !pedidoAlAbrir && !isFinishing) { pedidoAlAbrir = true; alternar() }
            }
        }
    }

    override fun onPause() { reloj.removeCallbacksAndMessages(null); super.onPause() }

    private fun tic() {
        refrescar()
        // ¿El móvil ya mira el draft? Lo dice el lector (`movil.consultas`, de GET /draft), cada 3 s.
        if (Nodo.arrancado && System.currentTimeMillis() / 1000 % 3 == 0L) thread(isDaemon = true) {
            val e = Cliente.pedir(this, "/estado")
            movilLee = (e?.optJSONObject("movil")?.optInt("consultas") ?: 0) > 0
            val cuenta = e?.let { Fallos.textoDeCuenta(it) }
            runOnUiThread { if (!isFinishing && cuenta != null) cuentaTablet.text = cuenta }
            val c = Cliente.pedir(this, "/correccion")?.optJSONObject("correccion")
            val p = Cliente.pedir(this, "/pregunta")?.optJSONObject("pregunta")
            // Un fallo al empezar a grabar no cierra la app: el aviso sale sin tener que volver a abrirla.
            val f = Fallos.sinVer(this)
            runOnUiThread { if (!isFinishing) { pintarCorreccion(c); pintarPregunta(p); pintarAviso(f) } }
        }
        reloj.postDelayed({ tic() }, 1000)
    }

    /** «¿Cómo acabó?»: la tablet no vio el final. Solo se rehace si llega otra pregunta. */
    private fun pintarPregunta(p: JSONObject?) {
        if (p == null) { if (preguntaId != null) { preguntaId = null; preguntaCard.visibility = View.GONE }; return }
        val id = p.optString("id")
        if (id == preguntaId) return
        preguntaId = id
        preguntaCard.removeAllViews()
        Contestar.pregunta(this, preguntaCard, p)
        preguntaCard.visibility = View.VISIBLE
    }

    /** «Enseña al lector»: solo se rehace si llega otra corrección (lo que estás escribiendo no se borra). */
    private fun pintarCorreccion(c: JSONObject?) {
        if (c == null) { if (correccionId != null) { correccionId = null; corregir.visibility = View.GONE }; return }
        val id = c.optString("id")
        if (id == correccionId) return
        correccionId = id
        corregir.removeAllViews()
        Contestar.correccion(this, corregir, c) { corregir.visibility = View.GONE }
        corregir.visibility = View.VISIBLE
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
        // Y al juego, si está instalado y no lo has quitado abajo.
        if (getSharedPreferences("lector", MODE_PRIVATE).getBoolean("abrirJuego", true)) packageManager.getLaunchIntentForPackage(JUEGO)?.let { reloj.postDelayed({ startActivity(it) }, 800) }
    }

    private fun codigoNuevo() {
        Vinculo.nuevo(this)
        if (!Nodo.arrancado) { qrDe = null; refrescar(); return }
        startService(Intent(this, Lector::class.java).setAction(Lector.PARAR))
        startActivity(Intent(this, Principal::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
        kotlin.system.exitProcess(0)
    }

    private fun refrescar() {
        val avisos = Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        val bateria = getSystemService(android.os.PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        val burbuja = Settings.canDrawOverlays(this)
        val linea = Solo.linea(this)
        val hechos = listOf(avisos, bateria, burbuja, Lector.grabando, linea != null, movilLee, false)
        pasos.forEachIndexed { i, p -> p.marcar(hechos[i], i + 1) }
        // La línea elegida, en oro; sin ninguna, «Apagado».
        for (b in botonesLinea) { val es = b.tag == linea; b.text = (if (es) "✓ " else "") + Solo.nombre(b.tag as String); pintarPildora(b, if (es) Estilo.Tipo.ELEGIDO else Estilo.Tipo.NORMAL) }
        apagarSolo.text = if (linea == null) "✓ Apagado" else "Apagado"
        pintarPildora(apagarSolo, if (linea == null) Estilo.Tipo.ELEGIDO else Estilo.Tipo.NORMAL)

        nueva?.let { actualizar.text = if (Lector.grabando) "Hay una versión nueva (${it.version}): se instala sola cuando dejes de leer." else "Actualizando a la ${it.version}…"; actualizar.visibility = View.VISIBLE }
            ?: run { actualizar.visibility = View.GONE }

        val caida = java.io.File(filesDir, "fallo.txt").takeIf { it.exists() }?.readText()?.lines()?.take(6)?.joinToString("\n")
        val salida = ultimaSalida ?: Salidas.ultima(this).also { ultimaSalida = it }
        estado.text = listOfNotNull(Nodo.fallo, Lector.estado, salida, caida?.let { "La última vez se cerró por:\n$it" }).joinToString("\n\n")
        boton.text = if (Lector.grabando) "Parar de leer" else "Empezar a leer"
        pintarPildora(boton, if (Lector.grabando) Estilo.Tipo.NORMAL else Estilo.Tipo.PRINCIPAL)
        // La tarjeta de estado: verde mientras lee.
        estadoTitulo.text = if (Lector.grabando) "●  Leyendo la pantalla" else "●  Parado"
        estadoTitulo.setTextColor(if (Lector.grabando) Estilo.VERDE else Estilo.TENUE)
        estadoDetalle.text = if (Lector.grabando)
            listOfNotNull(linea?.let { "Sin móvil: ${Solo.nombre(it)}" } ?: "Sin línea: elige una en «Sin móvil»", "Burbuja: ${Burbuja.estado}").joinToString(" · ")
        else "Toca «Empezar a leer», elige «Pantalla completa» y juega: el draft se lee solo."
        estadoCard.background = if (Lector.grabando) fondo(Color.rgb(16, 52, 28), Estilo.TARJETA, radio = 20, arista = Color.argb(120, 48, 209, 88)) else fondo(Estilo.TARJETA_ALTA, Estilo.TARJETA, radio = 20)
        esquinaBurbuja.text = "Burbuja con tu nº1: ${Burbuja.esquina(this)} (toca para cambiar) · ahora: ${Burbuja.estado}"

        val dir = Vinculo.ip(this)
        vinculo.text = if (dir == null) "Sin wifi: conecta la tablet a la misma wifi que el móvil." else
            "Escanea el QR con la cámara del móvil.\nO a mano, en Pick Assist → Ajustes → Lector en la tablet:\nDirección  $dir\nCódigo     ${Vinculo.codigo(this).chunked(5).joinToString("-")}"
        val enlace = Vinculo.enlace(this)
        if (enlace != qrDe) {
            qrDe = enlace
            qr.setImageBitmap(enlace?.let { Vinculo.qr(it) })
        }
        val log = Nodo.registro(this)
        registro.text = if (log.exists()) log.readLines().takeLast(25).joinToString("\n") else "(el lector aún no ha arrancado: toca «Empezar a leer»)"
    }
}
