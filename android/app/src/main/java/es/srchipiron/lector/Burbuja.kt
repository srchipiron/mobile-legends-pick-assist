package es.srchipiron.lector

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * La burbuja sobre el juego (3.62.0): tu nº1 (o tu pick fijado) y los dos
 * siguientes, lo que la app del móvil manda al lector (`/consejo`). Y el
 * resumen de cada partida apuntada, como notificación.
 *
 * Mientras juegas no sale (3.69.3): el lector deja de dar el consejo en
 * cuanto ve el minimapa dos veces seguidas, y vuelve con el draft siguiente.
 *
 * SEGURIDAD: la burbuja NO se puede tocar (FLAG_NOT_TOUCHABLE) y va con
 * opacidad 0,8, el máximo con el que Android deja pasar los toques al juego
 * de debajo (Android 12+). Solo enseña texto: no toca nada del juego.
 * Lo que sí se toca (contestar sin salir del juego, 3.84.0) es `Pendiente`,
 * y solo sale fuera del draft y de la partida.
 */
class Burbuja(private val contexto: Context) {
    companion object {
        val ESQUINAS = listOf("abajo", "arriba-izquierda", "arriba-derecha", "no")
        fun esquina(c: Context) = c.getSharedPreferences("lector", Context.MODE_PRIVATE).getString("burbuja", "abajo") ?: "abajo"
        fun siguienteEsquina(c: Context) {
            val i = (ESQUINAS.indexOf(esquina(c)) + 1) % ESQUINAS.size
            c.getSharedPreferences("lector", Context.MODE_PRIVATE).edit().putString("burbuja", ESQUINAS[i]).apply()
        }
        private const val CANAL = "partidas"
        /** Qué está haciendo la burbuja (3.68.1): va en salud.json y en la pantalla, para que un fallo no sea invisible. */
        @Volatile var estado: String = "parada"
    }

    private val ventana = contexto.getSystemService(WindowManager::class.java)
    private val principal = Handler(Looper.getMainLooper())
    private var vista: LinearLayout? = null
    private var titulo: TextView? = null
    private var detalle: TextView? = null
    @Volatile private var activa = false
    /** Lo que hay que contestar (3.84.0), con un botoncito que sí se toca, solo fuera del draft y de la partida. */
    private val pendiente = Pendiente(contexto)

    fun empezar() {
        if (activa) return
        activa = true
        thread(isDaemon = true, name = "burbuja") {
            while (activa) {
                try {
                    val r = leer()
                    if (r == null) estado = "el lector no contesta" else principal.post { pintar(r) }
                } catch (e: Throwable) { estado = "no llega al lector: ${e.javaClass.simpleName}" }
                Thread.sleep(2000)
            }
        }
    }

    fun parar() {
        activa = false
        estado = "parada"
        principal.post { quitar(); pendiente.quitarTodo() }
    }

    private fun leer(): JSONObject? {
        val c = URL("http://127.0.0.1:${Principal.PUERTO}/consejo").openConnection() as HttpURLConnection
        c.connectTimeout = 2000; c.readTimeout = 3000
        c.setRequestProperty("X-Lector-Codigo", Vinculo.codigo(contexto))
        return try { if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()) else null } finally { c.disconnect() }
    }

    private fun pintar(r: JSONObject) {
        val consejo = r.optJSONObject("consejo")
        val esq = esquina(contexto)
        if (consejo == null || esq == "no" || !Settings.canDrawOverlays(contexto)) {
            quitar()
            // En partida (3.69.3) el lector no da consejo a propósito: se quita para no tapar el juego.
            estado = when { !Settings.canDrawOverlays(contexto) -> "sin permiso"; esq == "no" -> "quitada"; r.optBoolean("enPartida") -> "escondida mientras juegas"; else -> "esperando consejo" }
        } else {
            if (vista == null) poner(esq)
            if (vista != null) estado = "enseñando"
            titulo?.text = consejo.optString("titulo")
            detalle?.text = consejo.optString("detalle", "").takeIf { it.isNotEmpty() && it != "null" } ?: ""
        }
        if (Settings.canDrawOverlays(contexto)) pendiente.pintar(r, esq)
        r.optJSONObject("resumen")?.let { avisar(it) }
    }

    private fun poner(esq: String) {
        val d = contexto.resources.displayMetrics.density
        val caja = LinearLayout(contexto).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((12 * d).toInt(), (6 * d).toInt(), (12 * d).toInt(), (6 * d).toInt())
            background = GradientDrawable().apply { cornerRadius = 14 * d; setColor(Color.argb(220, 12, 18, 34)); setStroke((1.5f * d).toInt(), Color.rgb(255, 214, 10)) }
        }
        titulo = TextView(contexto).apply { textSize = 15f; setTextColor(Color.rgb(255, 214, 10)); typeface = Typeface.DEFAULT_BOLD }
        detalle = TextView(contexto).apply { textSize = 11f; setTextColor(Color.rgb(220, 220, 220)) }
        caja.addView(titulo); caja.addView(detalle)
        val p = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            alpha = 0.8f
            gravity = when (esq) { "arriba-izquierda" -> Gravity.TOP or Gravity.START; "arriba-derecha" -> Gravity.TOP or Gravity.END; else -> Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL }
            x = (8 * d).toInt(); y = (8 * d).toInt()
        }
        try { ventana.addView(caja, p); vista = caja } catch (e: Throwable) { vista = null; estado = "Android no deja pintarla: ${e.javaClass.simpleName}" }
    }

    private fun quitar() {
        vista?.let { try { ventana.removeView(it) } catch (e: Throwable) {} }
        vista = null
    }

    /** El resumen de la partida, una vez por partida (se recuerda cuál fue el último). */
    private fun avisar(r: JSONObject) {
        val id = r.optString("id")
        val prefs = contexto.getSharedPreferences("lector", Context.MODE_PRIVATE)
        if (id.isEmpty() || prefs.getString("ultimoResumen", null) == id) return
        prefs.edit().putString("ultimoResumen", id).apply()
        val gestor = contexto.getSystemService(NotificationManager::class.java)
        gestor.createNotificationChannel(NotificationChannel(CANAL, "Resumen de cada partida", NotificationManager.IMPORTANCE_DEFAULT))
        gestor.notify(id.hashCode(), Notification.Builder(contexto, CANAL)
            .setSmallIcon(R.drawable.icono_mono)
            .setContentTitle(r.optString("titulo"))
            .setContentText(r.optString("texto"))
            .setStyle(Notification.BigTextStyle().bigText(r.optString("texto")))
            .setAutoCancel(true)
            // Tocarla abre la app (3.71.0): ahí está «Enseña al lector» si no reconoció a alguien.
            .setContentIntent(PendingIntent.getActivity(contexto, 0, Intent(contexto, Principal::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            .build())
    }
}
