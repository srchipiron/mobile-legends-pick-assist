package es.srchipiron.lector

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * El aspecto de Lector MLBB (3.91.0): el mismo lenguaje que Pick Assist en
 * el móvil. Fondo negro, tarjetas grises con una arista de luz, el amarillo
 * del sistema como acento único, botones en píldora (el principal en oro con
 * texto oscuro, los demás en cristal) y el verde, el rojo y el azul de
 * siempre para «hecho», «enemigo» y «tu equipo». Solo aspecto: ningún botón
 * cambia lo que hace.
 */
object Estilo {
    val ORO = Color.rgb(255, 214, 10)
    val ORO_CLARO = Color.rgb(255, 243, 160)
    val ORO_OSCURO = Color.rgb(242, 169, 0)
    val VERDE = Color.rgb(48, 209, 88)
    val ROJO = Color.rgb(255, 69, 58)
    val AZUL = Color.rgb(64, 156, 255)
    val TARJETA = Color.rgb(28, 28, 30)
    val TARJETA_ALTA = Color.rgb(36, 36, 39)
    val CRISTAL = Color.rgb(44, 44, 46)
    val ARISTA = Color.argb(36, 255, 255, 255)
    val TEXTO = Color.rgb(245, 245, 247)
    val TENUE = Color.argb(160, 235, 235, 245)

    enum class Tipo { PRINCIPAL, NORMAL, ELEGIDO, PELIGRO }
}

fun Context.dpx(x: Int) = (x * resources.displayMetrics.density).toInt()

/** Un fondo redondeado con su arista; `arriba` y `abajo` hacen un degradado vertical. */
fun Context.fondo(arriba: Int, abajo: Int = arriba, radio: Int = 14, arista: Int = Estilo.ARISTA, grosor: Int = 1) = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(arriba, abajo)).apply {
    cornerRadius = dpx(radio).toFloat()
    if (grosor > 0) setStroke(dpx(grosor), arista)
}

/** Lo que pinta una píldora de cada tipo, con la onda del toque encima. */
fun Context.pintarPildora(b: Button, tipo: Estilo.Tipo) {
    val (forma, texto) = when (tipo) {
        Estilo.Tipo.PRINCIPAL -> GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(Estilo.ORO_CLARO, Estilo.ORO, Estilo.ORO_OSCURO)).apply { cornerRadius = dpx(999).toFloat() } to Color.rgb(32, 24, 0)
        Estilo.Tipo.ELEGIDO -> fondo(Color.argb(46, 255, 214, 10), radio = 999, arista = Estilo.ORO, grosor = 1) to Estilo.ORO
        Estilo.Tipo.PELIGRO -> fondo(Color.argb(40, 255, 69, 58), radio = 999, arista = Estilo.ROJO, grosor = 1) to Color.rgb(255, 105, 97)
        Estilo.Tipo.NORMAL -> fondo(Estilo.CRISTAL, radio = 999) to Estilo.TEXTO
    }
    b.background = RippleDrawable(ColorStateList.valueOf(Color.argb(60, 255, 255, 255)), forma, null)
    b.setTextColor(texto)
}

/** Un botón en píldora: sin mayúsculas forzadas, sin sombra de Android, 48 dp de alto. */
fun Context.pildora(texto: String, tipo: Estilo.Tipo = Estilo.Tipo.NORMAL, alPulsar: (() -> Unit)? = null) = Button(this).apply {
    text = texto
    isAllCaps = false
    stateListAnimator = null
    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    textSize = if (tipo == Estilo.Tipo.PRINCIPAL) 17f else 15f
    minHeight = dpx(if (tipo == Estilo.Tipo.PRINCIPAL) 54 else 46)
    minimumHeight = minHeight
    setPadding(dpx(18), dpx(10), dpx(18), dpx(10))
    pintarPildora(this, tipo)
    alPulsar?.let { a -> setOnClickListener { a() } }
}

/** Un botón en una fila repartida a partes iguales: todos del alto del más alto, con aire. */
fun Context.repartido() = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f).apply { setMargins(dpx(4), dpx(4), dpx(4), dpx(4)) }

/** Un botón a todo lo ancho, con aire. */
fun Context.ancho() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { setMargins(0, dpx(6), 0, dpx(6)) }

/** El círculo de un paso: su número, o ✓ en verde cuando está hecho. */
fun Context.circulo(): TextView = TextView(this).apply {
    gravity = Gravity.CENTER
    textSize = 14f
    typeface = Typeface.DEFAULT_BOLD
}

fun Context.marcarCirculo(c: TextView, hecho: Boolean, n: Int) {
    c.text = if (hecho) "✓" else "$n"
    c.setTextColor(if (hecho) Color.rgb(0, 40, 10) else Estilo.ORO)
    c.background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        if (hecho) setColor(Estilo.VERDE) else { setColor(Color.argb(30, 255, 214, 10)); setStroke(dpx(1), Estilo.ORO) }
    }
}
