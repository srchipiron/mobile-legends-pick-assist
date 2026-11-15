package es.srchipiron.lector

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * Contestar sin salir del juego: si la tablet no vio cómo acabó tu partida
 * (`pendiente.pregunta` de `/consejo`), un botoncito arriba, encima del juego;
 * al tocarlo, un panel con lo mismo que las tarjetas de la app (`Contestar`):
 * «¿Cómo acabó?» y, si también hay, «Enseña al lector».
 *
 * SEGURIDAD: el botoncito y el panel SÍ se tocan (a diferencia de la burbuja
 * del consejo), así que solo salen FUERA del draft y de la partida: con la
 * `fase` del lector en «fuera» y sin partida. En cuanto empieza un draft o
 * una partida se quitan solos, para no tapar un botón del juego. No mandan
 * nada al juego: lo que tocas aquí solo llega al lector de la propia tablet.
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
        val hay = r.optJSONObject("pendiente")?.optBoolean("pregunta") == true
        // Solo con la fase dicha por el lector: sin ella (modo solo parado) no se sabe si hay un draft delante.
        val fuera = r.optString("fase") == "fuera" && !r.optBoolean("enPartida")
        if (!fuera || esquina == "no") { quitarChip(); cerrarPanel(); return }
        if (!hay || panel != null) { quitarChip(); return }
        if (chip == null) ponerChip()
    }

    fun quitarTodo() { quitarChip(); cerrarPanel() }

    private fun ponerChip() {
        val v = TextView(contexto).apply {
            text = "¿Cómo acabó tu partida? Toca aquí"
            textSize = 14f; setTextColor(Color.BLACK); typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(14), dp(8), dp(14), dp(8))
            background = GradientDrawable().apply { cornerRadius = 18 * d; setColor(Estilo.ORO) }
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
            val q = Cliente.pedir(contexto, "/pregunta")?.optJSONObject("pregunta")
            val c = Cliente.pedir(contexto, "/correccion")?.optJSONObject("correccion")
            principal.post { if (q != null || c != null) ponerPanel(q, c) }
        }
    }

    private fun ponerPanel(q: JSONObject?, c: JSONObject?) {
        cerrarPanel()
        val caja = LinearLayout(contexto).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(12), dp(16), dp(12)) }
        val marco = ScrollView(contexto).apply {
            background = GradientDrawable().apply { cornerRadius = 14 * d; setColor(Color.rgb(12, 18, 34)); setStroke(dp(2), Estilo.ORO) }
            addView(caja)
        }
        if (q != null) Contestar.pregunta(contexto, caja, q)
        if (c != null) Contestar.correccion(contexto, caja, c) { cerrarPanel() }
        caja.addView(contexto.pildora("Cerrar (luego en la app)") { cerrarPanel() }, contexto.ancho())
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
}
