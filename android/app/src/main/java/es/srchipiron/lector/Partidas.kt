package es.srchipiron.lector

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

/**
 * «Mis partidas» (3.75.0): las partidas tal como están en la base de datos
 * (con lo que la tablet aún no subió por encima), con fecha, pick,
 * resultado y quién iba en cada equipo. Tocar una la abre para arreglarla
 * (resultado, tu pick, enemigos, compañeros, baneos): se vuelve a subir, y
 * si cambias el resultado y quedan sus pantallas del final, el lector
 * aprende a reconocer esa tabla. Solo habla con el lector de la propia
 * tablet (127.0.0.1, con el código).
 */
class Partidas : Activity() {
    private fun dp(x: Int) = (x * resources.displayMetrics.density).toInt()
    private lateinit var lista: LinearLayout
    private lateinit var cabecera: TextView
    private var heroes: List<String> = emptyList()
    private val fecha = SimpleDateFormat("EEE d MMM · HH:mm", Locale("es", "ES"))

    override fun onCreate(guardado: Bundle?) {
        super.onCreate(guardado)
        val pad = dp(16)
        val cuerpo = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.BLACK) }
        cuerpo.addView(TextView(this).apply { text = "Mis partidas"; textSize = 26f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.rgb(255, 214, 10)) })
        cabecera = TextView(this).apply { textSize = 14f; setTextColor(Color.LTGRAY); setPadding(0, dp(4), 0, dp(8)); text = "Cargando…" }
        cuerpo.addView(cabecera)
        val fila = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fila.addView(Button(this).apply { text = "Volver"; setOnClickListener { finish() } }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        fila.addView(Button(this).apply { text = "Actualizar"; setOnClickListener { cargar() } }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        cuerpo.addView(fila)
        lista = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        cuerpo.addView(lista)
        val desplazar = ScrollView(this).apply { addView(cuerpo); setBackgroundColor(Color.BLACK); clipToPadding = false }
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
        cargar()
    }

    private fun nombres(a: JSONArray?) = a?.let { List(it.length()) { i -> it.optString(i) } }?.filter { it.isNotEmpty() && it != "null" } ?: emptyList()

    private fun cargar() {
        cabecera.text = "Cargando…"
        thread(isDaemon = true) {
            val r = pedir()
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                lista.removeAllViews()
                if (r == null) { cabecera.text = "El lector no contesta. ¿Está abierta la app y has tocado «Empezar a leer» alguna vez?"; return@runOnUiThread }
                heroes = nombres(r.optJSONArray("heroes"))
                val ps = r.optJSONArray("partidas") ?: JSONArray()
                val ganadas = (0 until ps.length()).count { ps.getJSONObject(it).optBoolean("gane") }
                cabecera.text = (if (r.optString("de") == "base") "Lo que hay en la base de datos" else "Sin conexión con la base de datos: lo guardado en esta tablet") +
                    " · ${ps.length()} partidas, $ganadas ganadas${if (ps.length() > 0) " (${ganadas * 100 / ps.length()}%)" else ""}.\nToca una para arreglarla si el lector se equivocó: así mejora."
                r.optJSONObject("semana")?.let { lista.addView(tuSemana(it), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) }) }
                r.optJSONObject("numeros")?.let { lista.addView(tusNumeros(it), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(12) }) }
                for (i in 0 until ps.length()) lista.addView(tarjeta(ps.getJSONObject(i)), LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })
            }
        }
    }

    /**
     * «Tu semana» (3.79.0), el mismo cálculo que en Pick Assist del móvil:
     * los últimos 7 días frente a los 7 de antes («mejor» o «peor» solo si
     * no cabe en el azar), los héroes que te funcionaron y los que te
     * costaron, y si cogiste el nº1.
     */
    private fun tuSemana(s: JSONObject): LinearLayout {
        val caja = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply { setColor(Color.rgb(28, 28, 30)); cornerRadius = dp(14).toFloat(); setStroke(dp(1), Color.rgb(255, 214, 10)) }
        }
        fun linea(t: String, color: Int = Color.WHITE, tam: Float = 15f) = TextView(this).apply { text = t; textSize = tam; setTextColor(color); setPadding(0, dp(3), 0, dp(3)) }
        val pct = { x: Double -> Math.round(x * 100) }
        caja.addView(linea("Tu semana", Color.rgb(255, 214, 10), 18f).apply { typeface = Typeface.DEFAULT_BOLD })
        val n = s.optInt("n"); val g = s.optInt("ganadas")
        caja.addView(linea("Últimos 7 días: $n partidas, $g–${n - g} (${pct(s.optDouble("wr"))}%)"))
        val a = s.optJSONObject("anterior")
        if (a == null) caja.addView(linea("La semana anterior no hay partidas: no hay con qué comparar.", Color.LTGRAY, 14f))
        else {
            caja.addView(linea("La semana anterior: ${pct(a.optDouble("wr"))}% en ${a.optInt("n")}."))
            val seVe = a.optBoolean("seVe"); val mejor = a.optDouble("dif") > 0
            caja.addView(linea(
                if (!seVe) "Cabe en el margen: vas parecido a la semana anterior." else if (mejor) "Ya no cabe en el azar: esta semana vas mejor." else "Ya no cabe en el azar: esta semana vas peor.",
                if (seVe) (if (mejor) Color.rgb(48, 209, 88) else Color.rgb(255, 159, 10)) else Color.LTGRAY, 14f,
            ))
        }
        fun heroes(arr: JSONArray?) = arr?.let { List(it.length()) { i -> it.getJSONObject(i) } }?.joinToString(", ") { h -> "${h.optString("heroe")} ${h.optInt("ganadas")}–${h.optInt("n") - h.optInt("ganadas")}" } ?: ""
        val bien = heroes(s.optJSONArray("funcionan")); val mal = heroes(s.optJSONArray("cuestan"))
        if (bien.isNotEmpty()) caja.addView(linea("Te funcionan: $bien", Color.rgb(48, 209, 88), 14f))
        if (mal.isNotEmpty()) caja.addView(linea("Te cuestan: $mal", Color.rgb(255, 69, 58), 14f))
        s.optJSONObject("numeroUno")?.let { u ->
            val c = u.optInt("cogido"); val total = u.optInt("n")
            caja.addView(linea("Cogiste el nº1 en $c de $total."))
            if (c > 0 && c < total) caja.addView(linea("Con el nº1 ganaste el ${pct(u.optDouble("wrCogido"))}%; con otro, el ${pct(u.optDouble("wrOtro"))}%.", Color.LTGRAY, 14f))
        }
        return caja
    }

    /**
     * «Tus números» (3.77.0), el mismo cálculo que en Pick Assist del móvil:
     * racha, hoy, cómo te va después de perder (solo afirmado si se
     * distingue de lo demás) y los héroes con los que ganas o pierdes más
     * de lo normal en ti.
     */
    private fun tusNumeros(n: JSONObject): LinearLayout {
        val caja = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply { setColor(Color.rgb(28, 28, 30)); cornerRadius = dp(14).toFloat(); setStroke(dp(1), Color.rgb(255, 214, 10)) }
        }
        fun linea(t: String, color: Int = Color.WHITE, tam: Float = 15f) = TextView(this).apply { text = t; textSize = tam; setTextColor(color); setPadding(0, dp(3), 0, dp(3)) }
        caja.addView(linea("Tus números", Color.rgb(255, 214, 10), 18f).apply { typeface = Typeface.DEFAULT_BOLD })
        val pct = { x: Double -> Math.round(x * 100) }
        n.optJSONObject("racha")?.let { r -> caja.addView(linea("Racha: ${r.optInt("n")} ${if (r.optBoolean("gane")) "ganadas" else "perdidas"} seguidas · en total ${pct(n.optDouble("wr"))}% de ${n.optInt("n")}")) }
        n.optJSONObject("sesion")?.let { s -> caja.addView(linea("Hoy: ${s.optInt("ganadas")} ganadas, ${s.optInt("n") - s.optInt("ganadas")} perdidas")) }
        val tras = n.optJSONObject("trasPerder")
        if (tras == null) caja.addView(linea("Después de perder: aún pocas partidas seguidas para saberlo.", Color.LTGRAY, 14f))
        else {
            caja.addView(linea("Después de perder ganas un ${pct(tras.optDouble("wr"))}% (${tras.optInt("n")}); después de ganar, un ${pct(tras.optDouble("wrResto"))}% (${tras.optInt("nResto")})."))
            caja.addView(linea(
                if (!tras.optBoolean("seVe")) "Con estas partidas no se distingue: perder no cambia la siguiente." else if (tras.optDouble("dif") < 0) "Se nota: tras perder te va peor. Un descanso tras dos derrotas puede ayudar." else "Se nota: tras perder te va mejor.",
                if (tras.optBoolean("seVe") && tras.optDouble("dif") < 0) Color.rgb(255, 159, 10) else Color.LTGRAY, 14f,
            ))
        }
        val heroes = n.optJSONArray("heroes")
        if (heroes != null && heroes.length() > 0) for (i in 0 until heroes.length()) {
            val h = heroes.getJSONObject(i)
            val mejor = h.optString("lado") == "mejor"
            caja.addView(linea("${h.optString("heroe")}: ${pct(h.optDouble("wr"))}% en ${h.optInt("n")} · ${if (mejor) "mejor que tu media" else "peor que tu media"}", if (mejor) Color.rgb(48, 209, 88) else Color.rgb(255, 69, 58), 14f))
        }
        return caja
    }

    private fun tarjeta(p: JSONObject): LinearLayout {
        val caja = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply { setColor(Color.rgb(28, 28, 30)); cornerRadius = dp(14).toFloat() }
        }
        val gane = p.optBoolean("gane")
        // Sin resultado (3.81.5): no se reconoció el final y no se contestó a tiempo; se dice aquí.
        val sinResultado = p.optBoolean("sinResultado")
        val pick = p.optString("pick")
        val marcas = listOfNotNull(
            if (p.optBoolean("supuesto")) "pick supuesto" else null,
            if (p.optBoolean("sinSubir")) "sin subir" else null,
            if (p.optString("resultadoDe") == "pregunta") "resultado contestado" else null,
            if (p.optBoolean("editada")) "arreglada" else null,
        )
        caja.addView(TextView(this).apply {
            text = "${if (sinResultado) "Sin resultado: toca y di cómo acabó" else if (gane) "Ganada" else "Perdida"} · $pick"
            textSize = 17f; typeface = Typeface.DEFAULT_BOLD
            setTextColor(if (sinResultado) Color.rgb(255, 159, 10) else if (gane) Color.rgb(48, 209, 88) else Color.rgb(255, 69, 58))
        })
        val dur = if (p.has("duracion")) " · ${p.optDouble("duracion").let { Math.round(it) }} min" else ""
        caja.addView(TextView(this).apply { text = fecha.format(Date(p.optLong("t"))) + dur + if (marcas.isNotEmpty()) " · ${marcas.joinToString(", ")}" else ""; textSize = 13f; setTextColor(Color.GRAY) })
        val enemigos = nombres(p.optJSONArray("enemigos")); val aliados = nombres(p.optJSONArray("aliados"))
        caja.addView(TextView(this).apply { text = "Contra: ${enemigos.joinToString(", ").ifEmpty { "—" }}\nCon: ${aliados.joinToString(", ").ifEmpty { "—" }}"; textSize = 14f; setTextColor(Color.LTGRAY); setPadding(0, dp(4), 0, 0) })
        val editor = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }
        caja.addView(editor)
        caja.setOnClickListener {
            if (editor.visibility == View.VISIBLE) return@setOnClickListener
            pintarEditor(editor, p); editor.visibility = View.VISIBLE
        }
        return caja
    }

    private fun campo(valor: String, pista: String) = AutoCompleteTextView(this).apply {
        setText(valor); hint = pista; threshold = 1; textSize = 16f; setSingleLine()
        setAdapter(ArrayAdapter(this@Partidas, android.R.layout.simple_dropdown_item_1line, heroes))
    }

    private fun pintarEditor(editor: LinearLayout, p: JSONObject) {
        editor.removeAllViews()
        // Sin resultado (3.81.5) no hay ninguno marcado: guardar sin elegir lo apuntaría como perdida.
        var gane: Boolean? = if (p.optBoolean("sinResultado")) null else p.optBoolean("gane")
        val resultado = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(8), 0, 0) }
        val bGane = Button(this).apply { text = "Gané" }
        val bPerdi = Button(this).apply { text = "Perdí" }
        fun pintarResultado() { bGane.alpha = if (gane == true) 1f else 0.4f; bPerdi.alpha = if (gane == false) 1f else 0.4f }
        bGane.setOnClickListener { gane = true; pintarResultado() }
        bPerdi.setOnClickListener { gane = false; pintarResultado() }
        pintarResultado()
        resultado.addView(bGane, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        resultado.addView(bPerdi, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        editor.addView(resultado)
        fun rotulo(t: String, color: Int) = TextView(this).apply { text = t; textSize = 15f; setTextColor(color); setPadding(0, dp(8), 0, 0) }
        editor.addView(rotulo("Tu pick", Color.rgb(255, 214, 10)))
        val pick = campo(p.optString("pick"), "Tu héroe").also { editor.addView(it) }
        editor.addView(rotulo("Enemigos", Color.rgb(255, 69, 58)))
        val en = nombres(p.optJSONArray("enemigos"))
        val enemigos = List(5) { i -> campo(en.getOrElse(i) { "" }, "Enemigo ${i + 1}").also { editor.addView(it) } }
        editor.addView(rotulo("Tus compañeros", Color.rgb(10, 132, 255)))
        val al = nombres(p.optJSONArray("aliados"))
        val aliados = List(4) { i -> campo(al.getOrElse(i) { "" }, "Compañero ${i + 1}").also { editor.addView(it) } }
        editor.addView(rotulo("Baneos", Color.LTGRAY))
        val bn = nombres(p.optJSONArray("bans"))
        val bans = List(10) { i -> campo(bn.getOrElse(i) { "" }, "Baneo ${i + 1}").also { editor.addView(it) } }
        val aviso = TextView(this).apply { textSize = 14f; setTextColor(Color.WHITE); setPadding(0, dp(6), 0, 0) }
        val guardar = Button(this).apply { text = "Guardar y subir" }
        val porNombre = heroes.associateBy { it.lowercase() }
        guardar.setOnClickListener {
            val todos = listOf(pick) + enemigos + aliados + bans
            val raros = todos.map { it.text.toString().trim() }.filter { it.isNotEmpty() && porNombre[it.lowercase()] == null }
            if (raros.isNotEmpty()) { aviso.text = "No conozco a: ${raros.joinToString(", ")}. Elige el nombre de la lista."; return@setOnClickListener }
            val resultadoElegido = gane ?: run { aviso.text = "Di primero si ganaste o perdiste."; return@setOnClickListener }
            fun de(v: AutoCompleteTextView) = porNombre[v.text.toString().trim().lowercase()]
            val cuerpo = JSONObject().put("t", p.optLong("t")).put("gane", resultadoElegido)
                .put("enemigos", JSONArray(enemigos.mapNotNull { de(it) }))
                .put("aliados", JSONArray(aliados.mapNotNull { de(it) }))
                .put("bans", JSONArray(bans.mapNotNull { de(it) }))
            de(pick)?.let { cuerpo.put("pick", it) }
            guardar.isEnabled = false; aviso.text = "Guardando…"
            thread(isDaemon = true) {
                val (estado, r) = mandar(cuerpo)
                runOnUiThread {
                    guardar.isEnabled = true
                    aviso.text = when (estado) {
                        200 -> if ((r?.optInt("aprendidos") ?: 0) > 0) "Guardada. Y he aprendido a reconocer la pantalla del final con el resultado bueno." else "Guardada: se sube a la base de datos en unos segundos."
                        400 -> when (r?.optString("error")) { "repetidos" -> "Hay un héroe repetido."; "nada" -> "No has cambiado nada."; else -> "Revisa los nombres." }
                        404 -> "Esa partida ya no está en la tablet."
                        else -> "El lector no contestó. Prueba otra vez."
                    }
                    if (estado == 200) cargar()
                }
            }
        }
        editor.addView(guardar)
        editor.addView(aviso)
    }

    private fun pedir(): JSONObject? = try {
        val c = URL("http://127.0.0.1:${Principal.PUERTO}/partidas").openConnection() as HttpURLConnection
        // Lee la base de datos de internet: puede tardar unos segundos.
        c.connectTimeout = 2000; c.readTimeout = 30000
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(this))
        try { if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()) else null } finally { c.disconnect() }
    } catch (e: Throwable) { null }

    private fun mandar(cuerpo: JSONObject): Pair<Int, JSONObject?> = try {
        val c = URL("http://127.0.0.1:${Principal.PUERTO}/partida").openConnection() as HttpURLConnection
        c.connectTimeout = 2000; c.readTimeout = 60000
        c.requestMethod = "POST"; c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(this))
        c.outputStream.use { it.write(cuerpo.toString().toByteArray()) }
        try {
            val estado = c.responseCode
            estado to try { JSONObject((if (estado < 400) c.inputStream else c.errorStream).bufferedReader().readText()) } catch (e: Exception) { null }
        } finally { c.disconnect() }
    } catch (e: Throwable) { 0 to null }
}
