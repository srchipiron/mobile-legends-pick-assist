package es.srchipiron.lector

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Contestar sin salir del juego (3.84.0): lo que la tablet sola no supo
 * («Enseña al lector» con los héroes que no reconoció, «¿Cómo acabó?») se
 * ofrece con un botoncito arriba, encima del juego; al tocarlo se abre un
 * panel con lo mismo que la tarjeta de la app (`Principal`), y contesta al
 * mismo lector (`/correccion`, `/pregunta`).
 *
 * SEGURIDAD: el botoncito y el panel SÍ se tocan (a diferencia de la burbuja
 * del consejo), así que solo salen FUERA del draft y de la partida: con la
 * `fase` del lector en «fuera» y sin partida. En cuanto empieza un draft o
 * una partida se quitan solos, para no tapar un botón del juego. No mandan
 * nada al juego: lo que tocas aquí solo llega al lector de la propia tablet
 * (127.0.0.1, con el código), como la tarjeta de la app.
 */
class Pendiente(private val contexto: Context) {
    private val ventana = contexto.getSystemService(WindowManager::class.java)
    private val principal = Handler(Looper.getMainLooper())
    private val d = contexto.resources.displayMetrics.density
    private var chip: TextView? = null
    private var panel: View? = null

    private fun dp(n: Int) = (n * d).toInt()

    /** Con cada lectura de `/consejo` (en el hilo principal). */
    fun pintar(r: JSONObject, esquina: String) {
        val p = r.optJSONObject("pendiente")
        val hay = p != null && (p.optBoolean("pregunta") || p.optBoolean("correccion"))
        // Solo con la fase dicha por el lector: sin ella (modo solo parado) no se sabe si hay un draft delante.
        val fuera = r.optString("fase") == "fuera" && !r.optBoolean("enPartida")
        if (!fuera || esquina == "no") { quitarChip(); cerrarPanel(); return }
        if (!hay) { quitarChip(); return }
        if (panel != null) { quitarChip(); return }
        if (chip == null) ponerChip()
        chip?.text = if (p!!.optBoolean("correccion")) "✎ Enseña al lector: toca aquí" else "¿Cómo acabó tu partida? Toca aquí"
    }

    fun quitarTodo() { quitarChip(); cerrarPanel() }

    private fun ponerChip() {
        val v = TextView(contexto).apply {
            textSize = 14f; setTextColor(Color.BLACK); typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(14), dp(8), dp(14), dp(8))
            background = GradientDrawable().apply { cornerRadius = 18 * d; setColor(Color.rgb(255, 214, 10)) }
            setOnClickListener { abrir() }
        }
        val p = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL; y = dp(6) }
        try { ventana.addView(v, p); chip = v } catch (e: Throwable) { chip = null }
    }

    private fun quitarChip() {
        chip?.let { try { ventana.removeView(it) } catch (e: Throwable) {} }
        chip = null
    }

    private fun cerrarPanel() {
        panel?.let { try { ventana.removeView(it) } catch (e: Throwable) {} }
        panel = null
    }

    /** Pide lo pendiente al lector y abre el panel. */
    private fun abrir() {
        quitarChip()
        thread(isDaemon = true) {
            val c = pedir("/correccion")?.optJSONObject("correccion")
            val q = pedir("/pregunta")?.optJSONObject("pregunta")
            principal.post { if (c != null || q != null) ponerPanel(c, q) }
        }
    }

    private fun ponerPanel(c: JSONObject?, q: JSONObject?) {
        cerrarPanel()
        val caja = LinearLayout(contexto).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
        }
        val marco = ScrollView(contexto).apply {
            background = GradientDrawable().apply { cornerRadius = 14 * d; setColor(Color.rgb(12, 18, 34)); setStroke(dp(2), Color.rgb(255, 214, 10)) }
            addView(caja)
        }
        val cerrar = Button(contexto).apply { text = "Cerrar (luego en la app)"; setOnClickListener { cerrarPanel() } }
        if (q != null) pregunta(caja, q)
        if (c != null) correccion(caja, c)
        caja.addView(cerrar)
        val pantalla = contexto.resources.displayMetrics
        val p = WindowManager.LayoutParams(
            minOf((pantalla.widthPixels * 0.92).toInt(), dp(560)), (pantalla.heightPixels * 0.9).toInt(),
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            // Con foco (para el teclado); los toques de fuera del panel siguen yendo al juego.
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.CENTER
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }
        try { ventana.addView(marco, p); panel = marco } catch (e: Throwable) { panel = null }
    }

    private fun titulo(texto: String) = TextView(contexto).apply { text = texto; textSize = 17f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.rgb(255, 214, 10)) }
    private fun nota(texto: String) = TextView(contexto).apply { text = texto; textSize = 13f; setTextColor(Color.LTGRAY); setPadding(0, dp(2), 0, dp(6)) }

    /** «¿Cómo acabó?»: lo mismo que `Principal.pintarPregunta`. */
    private fun pregunta(caja: LinearLayout, q: JSONObject) {
        val id = q.optString("id")
        val pick = q.optString("pick", "").takeIf { it.isNotEmpty() && it != "null" }
        caja.addView(titulo("¿Cómo acabó tu partida${pick?.let { " con $it" } ?: ""}?"))
        caja.addView(nota("No vi el resultado. Dímelo y la apunto."))
        val aviso = TextView(contexto).apply { textSize = 13f; setTextColor(Color.WHITE) }
        val fila = LinearLayout(contexto).apply { orientation = LinearLayout.HORIZONTAL }
        val botones = listOf("Gané" to true, "Perdí" to false, "No la terminé" to null).map { (texto, gane) ->
            Button(contexto).apply { text = texto }.also { fila.addView(it, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)) } to gane
        }
        for ((b, gane) in botones) b.setOnClickListener {
            botones.forEach { it.first.isEnabled = false }
            thread(isDaemon = true) {
                val estado = mandar("/pregunta", JSONObject().put("id", id).put("gane", gane ?: JSONObject.NULL), 20000)?.optInt("estado") ?: 0
                principal.post {
                    aviso.text = when (estado) {
                        200 -> if (gane == null) "Vale: esa partida no se apunta." else "Apuntada como ${if (gane) "ganada" else "perdida"}."
                        409 -> "Esa partida ya no se puede contestar."
                        else -> { botones.forEach { it.first.isEnabled = true }; "El lector no contestó: prueba otra vez." }
                    }
                }
            }
        }
        caja.addView(fila)
        caja.addView(aviso)
    }

    /**
     * «Enseña al lector»: los diez huecos, con lo leído ya puesto. Sin listas
     * desplegables (encima de otra app se pierden): al escribir salen debajo
     * los héroes que empiezan así, y tocarlo lo pone y salta al hueco vacío
     * siguiente. Lo mismo que `Principal.pintarCorreccion`.
     */
    private fun correccion(caja: LinearLayout, c: JSONObject) {
        val id = c.optString("id")
        val heroes = c.optJSONArray("heroes")?.let { a -> List(a.length()) { a.optString(it) } }.orEmpty()
        val porNombre = heroes.associateBy { it.lowercase() }
        val leidos = c.optJSONObject("leidos") ?: JSONObject()
        val tuyoFila = leidos.optInt("tuyoFila", -1)
        fun nombre(a: JSONArray?, i: Int) = a?.optString(i, "")?.takeIf { it.isNotEmpty() && it != "null" } ?: ""
        caja.addView(titulo("Enseña al lector"))
        caja.addView(nota("En tu última partida no reconoció a todos. Escribe quién era el que falta (lo leído ya está) y toca «Enseñar»."))
        val sugerencias = LinearLayout(contexto).apply { orientation = LinearLayout.HORIZONTAL }
        val tira = HorizontalScrollView(contexto).apply { addView(sugerencias) }
        val campos = mutableListOf<EditText>()
        fun campo(valor: String, pista: String) = EditText(contexto).apply {
            setText(valor); hint = pista; textSize = 15f; setSingleLine()
            setTextColor(Color.WHITE); setHintTextColor(Color.GRAY)
        }.also { e ->
            campos += e
            fun sugerir() {
                sugerencias.removeAllViews()
                val t = e.text.toString().trim().lowercase()
                if (t.isEmpty() || porNombre[t] != null) return
                val salen = (heroes.filter { it.lowercase().startsWith(t) } + heroes.filter { !it.lowercase().startsWith(t) && it.lowercase().contains(t) }).take(8)
                for (h in salen) sugerencias.addView(Button(contexto).apply {
                    text = h; isAllCaps = false
                    setOnClickListener {
                        e.setText(h)
                        sugerencias.removeAllViews()
                        campos.firstOrNull { it.text.isBlank() }?.requestFocus()
                    }
                })
            }
            e.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, n: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, n: Int) {}
                override fun afterTextChanged(s: Editable?) { if (e.hasFocus()) sugerir() }
            })
            e.setOnFocusChangeListener { _, foco -> if (foco) sugerir() }
        }
        // Tu héroe con un toque (3.85.0): eliges el último y tu hueco pasa a la foto de la skin, que el lector no conoce.
        val tuyos = c.optJSONArray("tuyos")?.let { a -> List(a.length()) { a.optString(it) } }.orEmpty().filter { porNombre[it.lowercase()] != null }
        val filaTuyos = LinearLayout(contexto).apply { orientation = LinearLayout.VERTICAL }
        caja.addView(filaTuyos)
        caja.addView(TextView(contexto).apply { text = "Enemigos"; textSize = 14f; setTextColor(Color.rgb(255, 69, 58)) })
        val enemigos = List(5) { i -> campo(nombre(leidos.optJSONArray("enemigos"), i), "Enemigo ${i + 1}").also { caja.addView(it) } }
        caja.addView(TextView(contexto).apply { text = "Tu equipo"; textSize = 14f; setTextColor(Color.rgb(10, 132, 255)); setPadding(0, dp(6), 0, 0) })
        // Sin tu fila leída, cuatro compañeros con lo leído y «Tú» aparte (como en la app).
        val sinFila = tuyoFila !in 0..4
        val leidosAliados = leidos.optJSONArray("aliados")
        val iniciales = if (sinFila) List(5) { nombre(leidosAliados, it) }.filter { it.isNotEmpty() }.take(4).let { it + List(5 - it.size) { "" } }.take(4) + "" else List(5) { nombre(leidosAliados, it) }
        val filaTuya = if (sinFila) 4 else tuyoFila
        val aliados = List(5) { i -> campo(iniciales[i], if (i == filaTuya) "Tú" else "Compañero ${i + 1}").also { caja.addView(it) } }
        if (tuyos.isNotEmpty() && aliados[filaTuya].text.isBlank()) {
            filaTuyos.addView(TextView(contexto).apply { text = "¿Con quién jugaste tú?"; textSize = 14f; setTextColor(Color.rgb(255, 214, 10)) })
            val botonesTuyos = LinearLayout(contexto).apply { orientation = LinearLayout.HORIZONTAL }
            for (h in tuyos) botonesTuyos.addView(Button(contexto).apply { text = h; isAllCaps = false; setOnClickListener { aliados[filaTuya].setText(h); sugerencias.removeAllViews() } })
            filaTuyos.addView(HorizontalScrollView(contexto).apply { addView(botonesTuyos) })
        }
        // Las sugerencias, justo debajo de los huecos (el teclado tapa la mitad de abajo).
        caja.addView(tira)
        val aviso = TextView(contexto).apply { textSize = 13f; setTextColor(Color.WHITE); setPadding(0, dp(4), 0, 0) }
        val ensenar = Button(contexto).apply { text = "Enseñar" }
        val ahoraNo = Button(contexto).apply { text = "Ahora no" }
        ensenar.setOnClickListener {
            val raros = campos.map { it.text.toString().trim() }.filter { it.isNotEmpty() && porNombre[it.lowercase()] == null }
            if (raros.isNotEmpty()) { aviso.text = "No conozco a: ${raros.joinToString(", ")}. Toca uno de los nombres que salen al escribir."; return@setOnClickListener }
            val de = { v: EditText -> porNombre[v.text.toString().trim().lowercase()] }
            val cuerpo = JSONObject().put("id", id)
                .put("enemigos", JSONArray(enemigos.mapNotNull(de)))
                .put("aliados", JSONArray(aliados.filterIndexed { i, _ -> i != filaTuya }.mapNotNull(de)))
            de(aliados[filaTuya])?.let { cuerpo.put("tuyo", it) }
            ensenar.isEnabled = false; ahoraNo.isEnabled = false
            aviso.text = "Aprendiendo de las capturas… (puede tardar un minuto; puedes seguir jugando)"
            thread(isDaemon = true) {
                // Aprender lleva unas decenas de segundos por captura.
                val r = mandar("/correccion", cuerpo, 180000)
                principal.post {
                    val res = r?.optJSONObject("r")
                    aviso.text = when (r?.optInt("estado") ?: 0) {
                        200 -> {
                            val ap = res?.optJSONArray("aprendidos")?.let { a -> List(a.length()) { a.optString(it) } }.orEmpty()
                            val no = res?.optJSONArray("sinEncontrar")?.let { a -> List(a.length()) { a.optString(it) } }.orEmpty()
                            listOfNotNull(
                                if (ap.isNotEmpty()) "Aprendido: ${ap.joinToString(", ")}." else "Gracias: la partida queda corregida.",
                                if (no.isNotEmpty()) "No los encontré en las capturas: ${no.joinToString(", ")}." else null,
                            ).joinToString(" ")
                        }
                        400 -> { ensenar.isEnabled = true; ahoraNo.isEnabled = true; "Revisa los nombres: hay uno repetido o falta algún enemigo." }
                        409 -> "Esa partida ya no se puede corregir (pasó mucho tiempo)."
                        else -> { ensenar.isEnabled = true; ahoraNo.isEnabled = true; "El lector no contestó: prueba otra vez." }
                    }
                }
            }
        }
        ahoraNo.setOnClickListener {
            cerrarPanel()
            thread(isDaemon = true) { mandar("/correccion", JSONObject().put("id", id).put("descartar", true), 20000) }
        }
        val botones = LinearLayout(contexto).apply { orientation = LinearLayout.HORIZONTAL }
        botones.addView(ensenar, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        botones.addView(ahoraNo, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        caja.addView(botones)
        caja.addView(aviso)
    }

    /** GET al lector de la propia tablet (127.0.0.1, con el código); null si no contesta 200. */
    private fun pedir(ruta: String): JSONObject? = try {
        val c = URL("http://127.0.0.1:${Principal.PUERTO}$ruta").openConnection() as HttpURLConnection
        c.connectTimeout = 1000; c.readTimeout = 2000
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(contexto))
        try { if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()) else null } finally { c.disconnect() }
    } catch (e: Throwable) { null }

    /** POST al lector de la propia tablet: `{estado, r}`, o null si no contesta. */
    private fun mandar(ruta: String, cuerpo: JSONObject, espera: Int): JSONObject? = try {
        val c = URL("http://127.0.0.1:${Principal.PUERTO}$ruta").openConnection() as HttpURLConnection
        c.connectTimeout = 2000; c.readTimeout = espera
        c.requestMethod = "POST"; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(contexto))
        c.outputStream.use { it.write(cuerpo.toString().toByteArray()) }
        try { JSONObject().put("estado", c.responseCode).put("r", if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()) else JSONObject()) } finally { c.disconnect() }
    } catch (e: Throwable) { null }
}
