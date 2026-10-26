package es.srchipiron.lector

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * La guía completa (3.75.0), pedida por Javi: «me ha costado encontrar eso
 * de apuntar mis partidas. Haz una suite en el apk paso por paso para que
 * todo funcione y se configure como es debido… que explique qué hace cada
 * cosa». Texto fijo: cómo dejarlo todo listo, por orden, y qué hace cada
 * parte de Lector MLBB y de Pick Assist. Se abre la primera vez y desde el
 * botón «Guía completa» de la pantalla principal.
 */
class Guia : Activity() {
    companion object {
        /** Lo que se explica, por secciones: título y párrafos. */
        val SECCIONES = listOf(
            "Qué es" to listOf(
                "Lector MLBB mira la pantalla de esta tablet mientras juegas a Mobile Legends, lee el draft (baneos, enemigos, tu equipo) y te dice qué héroe coger. Apunta tus partidas solo y aprende de ellas.",
                "Solo MIRA la pantalla: no toca el juego, no pulsa nada y no entra en tu cuenta. Las capturas no salen de la tablet; a internet solo van nombres de héroes y el resultado.",
            ),
            "Configurarlo, paso a paso (una vez)" to listOf(
                "1. Avisos: toca «Permitir avisos». Así te llega el resumen de cada partida y las preguntas («¿cómo acabó?»).",
                "2. Batería: toca «Quitar el ahorro de batería». Si no, Android puede cerrar el lector con el juego delante.",
                "3. Burbuja: toca «Permitir la burbuja». Es el recuadro pequeño encima del juego con tu nº1. Puedes cambiarla de esquina en Ajustes.",
                "4. Tu línea: en «Sin móvil» elige la línea que juegas (Roam, Jungla, Mid, Oro o Exp). Con eso la tablet decide sola.",
                "5. Empezar: toca «Empezar a leer» y, cuando Android pregunte qué grabar, elige «Pantalla completa». Hay que hacerlo cada vez que abres la app: es una norma de Android.",
                "6. Juega. No tienes que tocar nada más: tus partidas se guardan solas en la base de datos.",
            ),
            "Durante el draft" to listOf(
                "En baneos, la burbuja dice a quién banear (los tres que más te convienen quitar). En picks, tu nº1 con su probabilidad y los dos siguientes.",
                "La decisión es la misma que la de Pick Assist: datos de miles de partidas de tu rango, los cruces y parejas entre héroes y cómo te va a ti con cada uno. «De los tuyos» es el mejor de los que más juegas, si el nº1 no lo es.",
                "Si una cara no la reconoce sale «?»: sigue decidiendo con lo que sí ve.",
            ),
            "Durante la partida" to listOf(
                "La burbuja se esconde para no molestar. La voz te da los consejos de tu héroe en su minuto (cuándo apretar, cuándo aguantar). Se calla en Ajustes → «Voz en partida».",
                "Al acabar, lee la pantalla del resultado y apunta la partida: fecha, tu pick, resultado, enemigos, compañeros, baneos y duración.",
            ),
            "Cuando no está seguro" to listOf(
                "«¿Cómo acabó tu partida?»: si no reconoce el final, te lo pregunta arriba del todo. Con tu respuesta apunta la partida y APRENDE esa pantalla, así la próxima la reconoce sola.",
                "«Enseña al lector»: si no reconoció a algún héroe del draft, te pide quién era. Con eso aprende su cara de las capturas y corrige la partida.",
            ),
            "Mis partidas" to listOf(
                "Botón «Mis partidas»: el registro de todas tus partidas tal como están en la base de datos, con fecha, pick, resultado y quién iba en cada equipo.",
                "Toca una para arreglarla si el lector se equivocó (resultado, tu pick, un enemigo que faltaba…). Se sube corregida y las estadísticas, tu maestría y la medida del modelo usan la buena. Si cambias el resultado de una partida de hace poco, además aprende la pantalla del final.",
                "Las marcadas «pick supuesto» son partidas en las que no vio tu fila: puso el nº1. Si jugaste otro, cámbialo.",
            ),
            "La base de datos" to listOf(
                "Tus partidas se guardan solas en una base de datos (Supabase), con la clave de esta tablet. Sirven para medir si el modelo acierta y mejorarlo con tus partidas reales.",
                "No guarda tu nombre ni tu cuenta del juego: solo héroes, resultado y fecha, con un número de jugador.",
            ),
            "El móvil, tu centro de mando" to listOf(
                "Pick Assist es la app web del móvil: tus estadísticas, el historial, el meta, la ficha de cada héroe y el diagnóstico. Para unirlo a la tablet: abre Pick Assist, escanea el QR de «Vincular el móvil» con la cámara y toca «Vincular» (misma wifi). Una vez basta.",
                "Vinculados, móvil y tablet usan la MISMA clave: en el móvil ves todas las partidas que apunta la tablet, con tus números, y lo que arregles en uno aparece en el otro (gana el arreglo más reciente). No tienes que activar nada a mano.",
                "El móvil también manda a la tablet tu maestría (cómo te va con cada héroe) y tu línea, y puede leer el draft él. Si el móvil está leyendo, manda el móvil y la tablet se aparta.",
            ),
            "Mantenimiento solo" to listOf(
                "Se actualiza sola al abrirla si hay versión nueva (cuando no está grabando).",
                "Cada 15 minutos manda un parte de salud (si graba, errores, memoria) sin datos personales, y una revisión automática lo mira cada mañana y arregla lo que falle.",
                "Si la app se cierra por un fallo, sale un aviso rojo arriba con «Copiar»: pégalo en el chat.",
            ),
        )
    }

    private fun dp(x: Int) = (x * resources.displayMetrics.density).toInt()

    override fun onCreate(guardado: Bundle?) {
        super.onCreate(guardado)
        getSharedPreferences("lector", MODE_PRIVATE).edit().putBoolean("guiaVista", true).apply()
        val pad = dp(16)
        val cuerpo = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.BLACK) }
        cuerpo.addView(TextView(this).apply { text = "Guía de Lector MLBB"; textSize = 26f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.rgb(255, 214, 10)) })
        for ((titulo, parrafos) in SECCIONES) {
            val caja = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(pad, pad, pad, pad)
                background = GradientDrawable().apply { setColor(Color.rgb(28, 28, 30)); cornerRadius = dp(14).toFloat() }
            }
            caja.addView(TextView(this).apply { text = titulo; textSize = 18f; typeface = Typeface.DEFAULT_BOLD; setTextColor(Color.rgb(255, 214, 10)); setPadding(0, 0, 0, dp(4)) })
            for (p in parrafos) caja.addView(TextView(this).apply { text = p; textSize = 15f; setTextColor(Color.WHITE); setLineSpacing(0f, 1.15f); setPadding(0, dp(4), 0, dp(4)) })
            cuerpo.addView(caja, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) })
        }
        cuerpo.addView(Button(this).apply { text = "Entendido"; setOnClickListener { finish() } }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) })
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
    }
}
