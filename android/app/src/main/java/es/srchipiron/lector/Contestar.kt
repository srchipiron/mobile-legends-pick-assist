package es.srchipiron.lector

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Lo que la tablet sola no supo, contestado IGUAL en la tarjeta de la app
 * (`Principal`) y en el panel encima del juego (`Pendiente`): «¿Cómo acabó?»
 * (`/pregunta`) y «Enseña al lector» (`/correccion`). Sin listas desplegables
 * (encima de otra app se pierden): al escribir salen debajo los héroes que
 * empiezan así. Solo habla con el lector de la propia tablet (`Cliente`).
 */
object Contestar {
    private val principal = Handler(Looper.getMainLooper())

    private fun titulo(ctx: Context, texto: String) = TextView(ctx).apply { text = texto; textSize = 18f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Estilo.ORO) }
    private fun nota(ctx: Context, texto: String) = TextView(ctx).apply { text = texto; textSize = 14f; setTextColor(Color.LTGRAY); setPadding(0, ctx.dpx(4), 0, ctx.dpx(8)) }
    private fun aviso(ctx: Context) = TextView(ctx).apply { textSize = 14f; setTextColor(Color.WHITE); setPadding(0, ctx.dpx(6), 0, 0) }
    private fun fila(ctx: Context) = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; isBaselineAligned = false }
    private fun lista(a: JSONArray?) = a?.let { List(it.length()) { i -> it.optString(i) } }.orEmpty()

    /** «¿Cómo acabó tu partida?»: Gané, Perdí o No la terminé. Con la respuesta la tablet apunta la partida. */
    fun pregunta(ctx: Context, caja: LinearLayout, q: JSONObject) {
        val id = q.optString("id")
        val pick = q.optString("pick", "").takeIf { it.isNotEmpty() && it != "null" }
        caja.addView(titulo(ctx, "¿Cómo acabó tu partida${pick?.let { " con $it" } ?: ""}?"))
        caja.addView(nota(ctx, "No vi el resultado. Dímelo y la apunto."))
        val dicho = aviso(ctx)
        val botonera = fila(ctx)
        val botones = listOf("Gané" to true, "Perdí" to false, "No la terminé" to null).map { (texto, gane) ->
            ctx.pildora(texto, if (gane == true) Estilo.Tipo.PRINCIPAL else if (gane == false) Estilo.Tipo.PELIGRO else Estilo.Tipo.NORMAL).also { botonera.addView(it, ctx.repartido()) } to gane
        }
        for ((b, gane) in botones) b.setOnClickListener {
            botones.forEach { it.first.isEnabled = false }
            thread(isDaemon = true) {
                val estado = Cliente.mandar(ctx, "/pregunta", JSONObject().put("id", id).put("gane", gane ?: JSONObject.NULL)).estado
                principal.post {
                    dicho.text = when (estado) {
                        200 -> if (gane == null) "Vale: esa partida no se apunta." else "Apuntada como ${if (gane) "ganada" else "perdida"}."
                        409 -> "Esa partida ya no se puede contestar."
                        else -> { botones.forEach { it.first.isEnabled = true }; "El lector no contestó: ¿está leyendo? Prueba otra vez." }
                    }
                }
            }
        }
        caja.addView(botonera)
        caja.addView(dicho)
    }

    /**
     * «Enseña al lector»: los diez huecos de tu última partida con lo que sí
     * leyó ya puesto. Escribes quién era el que falta y tocas «Enseñar»: la
     * partida apuntada se arregla y el lector aprende de las capturas de ese
     * draft. «Ahora no» la descarta (y llama a `alQuitar`).
     */
    fun correccion(ctx: Context, caja: LinearLayout, c: JSONObject, alQuitar: () -> Unit) {
        val id = c.optString("id")
        val heroes = lista(c.optJSONArray("heroes"))
        val porNombre = heroes.associateBy { it.lowercase() }
        val leidos = c.optJSONObject("leidos") ?: JSONObject()
        val tuyoFila = leidos.optInt("tuyoFila", -1)
        fun nombre(a: JSONArray?, i: Int) = a?.optString(i, "")?.takeIf { it.isNotEmpty() && it != "null" } ?: ""
        caja.addView(titulo(ctx, "Enseña al lector"))
        caja.addView(nota(ctx, "En tu última partida no reconoció a todos. Escribe quién era el que falta (lo que sí leyó ya está puesto) y toca «Enseñar»: aprende de las capturas de ese draft y la próxima vez lo reconoce."))
        val sugerencias = fila(ctx)
        val campos = mutableListOf<EditText>()
        fun campo(valor: String, pista: String) = EditText(ctx).apply {
            setText(valor); hint = pista; textSize = 16f; setSingleLine()
            setTextColor(Color.WHITE); setHintTextColor(Color.GRAY)
        }.also { e ->
            campos += e
            fun sugerir() {
                sugerencias.removeAllViews()
                val t = e.text.toString().trim().lowercase()
                if (t.isEmpty() || porNombre[t] != null) return
                val salen = (heroes.filter { it.lowercase().startsWith(t) } + heroes.filter { !it.lowercase().startsWith(t) && it.lowercase().contains(t) }).take(8)
                for (h in salen) sugerencias.addView(ctx.pildora(h) {
                    e.setText(h)
                    sugerencias.removeAllViews()
                    campos.firstOrNull { it.text.isBlank() }?.requestFocus()
                })
            }
            e.addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, n: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, n: Int) {}
                override fun afterTextChanged(s: Editable?) { if (e.hasFocus()) sugerir() }
            })
            e.setOnFocusChangeListener { _, foco -> if (foco) sugerir() }
        }
        // Tu héroe con un toque: eliges el último y tu hueco pasa a la foto de la skin, que el lector no conoce.
        val tuyos = lista(c.optJSONArray("tuyos")).filter { porNombre[it.lowercase()] != null }
        val filaTuyos = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        caja.addView(filaTuyos)
        caja.addView(TextView(ctx).apply { text = "Enemigos"; textSize = 15f; setTextColor(Estilo.ROJO) })
        val enemigos = List(5) { i -> campo(nombre(leidos.optJSONArray("enemigos"), i), "Enemigo ${i + 1}").also { caja.addView(it) } }
        caja.addView(TextView(ctx).apply { text = "Tu equipo"; textSize = 15f; setTextColor(Estilo.AZUL); setPadding(0, ctx.dpx(8), 0, 0) })
        // Sin tu fila leída no se sabe cuál de los cinco eras tú: cuatro compañeros con lo leído y «Tú» aparte, vacío.
        val sinFila = tuyoFila !in 0..4
        val leidosAliados = leidos.optJSONArray("aliados")
        val iniciales = if (sinFila) List(5) { nombre(leidosAliados, it) }.filter { it.isNotEmpty() }.take(4).let { it + List(4 - it.size) { "" } } + "" else List(5) { nombre(leidosAliados, it) }
        val filaTuya = if (sinFila) 4 else tuyoFila
        val aliados = List(5) { i -> campo(iniciales[i], if (i == filaTuya) "Tú" else "Compañero ${i + 1}").also { caja.addView(it) } }
        if (tuyos.isNotEmpty() && aliados[filaTuya].text.isBlank()) {
            filaTuyos.addView(TextView(ctx).apply { text = "¿Con quién jugaste tú?"; textSize = 15f; setTextColor(Estilo.ORO) })
            val botonesTuyos = fila(ctx)
            for (h in tuyos) botonesTuyos.addView(ctx.pildora(h) { aliados[filaTuya].setText(h); sugerencias.removeAllViews() })
            filaTuyos.addView(HorizontalScrollView(ctx).apply { addView(botonesTuyos) })
        }
        // Las sugerencias, justo debajo de los huecos (el teclado tapa la mitad de abajo).
        caja.addView(HorizontalScrollView(ctx).apply { addView(sugerencias) })
        val dicho = aviso(ctx)
        val ensenar = ctx.pildora("Enseñar", Estilo.Tipo.PRINCIPAL)
        val ahoraNo = ctx.pildora("Ahora no")
        ensenar.setOnClickListener {
            val raros = campos.map { it.text.toString().trim() }.filter { it.isNotEmpty() && porNombre[it.lowercase()] == null }
            if (raros.isNotEmpty()) { dicho.text = "No conozco a: ${raros.joinToString(", ")}. Toca uno de los nombres que salen al escribir."; return@setOnClickListener }
            val de = { v: EditText -> porNombre[v.text.toString().trim().lowercase()] }
            val cuerpo = JSONObject().put("id", id)
                .put("enemigos", JSONArray(enemigos.mapNotNull(de)))
                .put("aliados", JSONArray(aliados.filterIndexed { i, _ -> i != filaTuya }.mapNotNull(de)))
            de(aliados[filaTuya])?.let { cuerpo.put("tuyo", it) }
            ensenar.isEnabled = false; ahoraNo.isEnabled = false
            dicho.text = "Aprendiendo de las capturas… (puede tardar un minuto; puedes seguir jugando)"
            thread(isDaemon = true) {
                // Aprender lleva unas decenas de segundos por captura.
                val r = Cliente.mandar(ctx, "/correccion", cuerpo, 180000)
                principal.post {
                    dicho.text = when (r.estado) {
                        200 -> {
                            val ap = lista(r.json?.optJSONArray("aprendidos"))
                            val no = lista(r.json?.optJSONArray("sinEncontrar"))
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
            alQuitar()
            thread(isDaemon = true) { Cliente.mandar(ctx, "/correccion", JSONObject().put("id", id).put("descartar", true)) }
        }
        val botones = fila(ctx)
        botones.addView(ensenar, ctx.repartido())
        botones.addView(ahoraNo, ctx.repartido())
        caja.addView(botones)
        caja.addView(dicho)
    }
}
