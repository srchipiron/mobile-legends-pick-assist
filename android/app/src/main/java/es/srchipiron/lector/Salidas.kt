package es.srchipiron.lector

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import java.io.File

/**
 * Por qué se cerró la app la última vez (3.61.5): sin ordenador no hay
 * logcat, y «se cierra sola» puede ser Android matándola por memoria con el
 * juego abierto, un fallo del lector o un cierre normal. Android lo apunta
 * (ApplicationExitInfo, Android 11+); aquí se traduce y se enseña en la
 * pantalla de la app y en el Diagnóstico de la app del móvil.
 */
object Salidas {
    private fun motivo(r: Int) = when (r) {
        ApplicationExitInfo.REASON_LOW_MEMORY -> "Android la cerró por falta de memoria"
        ApplicationExitInfo.REASON_CRASH -> "fallo de la app"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "fallo del lector (código nativo)"
        ApplicationExitInfo.REASON_ANR -> "la app dejó de responder"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "Android la cerró por gastar demasiado"
        ApplicationExitInfo.REASON_SIGNALED -> "la cerró el sistema (señal)"
        ApplicationExitInfo.REASON_EXIT_SELF -> "se cerró ella misma"
        ApplicationExitInfo.REASON_USER_REQUESTED -> "la cerraste tú (o el ahorro de batería)"
        ApplicationExitInfo.REASON_USER_STOPPED -> "forzaste su detención"
        ApplicationExitInfo.REASON_PACKAGE_UPDATED -> "se actualizó"
        ApplicationExitInfo.REASON_FREEZER -> "Android la congeló"
        else -> "motivo $r"
    }

    /** La última salida, en una línea; null si no hay (o Android < 11). Más lo que dejó Node al pararse. */
    fun ultima(contexto: Context): String? {
        val nodo = File(contexto.filesDir, "salida-nodo.txt").takeIf { it.exists() }?.readText()?.trim()
        if (Build.VERSION.SDK_INT < 30) return nodo
        val am = contexto.getSystemService(ActivityManager::class.java)
        val info = am.getHistoricalProcessExitReasons(contexto.packageName, 0, 1).firstOrNull() ?: return nodo
        val hace = (System.currentTimeMillis() - info.timestamp) / 60000
        val memoria = if (info.pss > 0) " · usaba ${info.pss / 1024} MB" else ""
        return listOfNotNull("Último cierre (hace $hace min): ${motivo(info.reason)}$memoria${info.description?.let { " · $it" } ?: ""}", nodo).joinToString("\n")
    }

    /** Los cierres que son un fallo (no «la cerraste tú» ni «se actualizó»). */
    private val FALLOS = setOf(
        ApplicationExitInfo.REASON_LOW_MEMORY, ApplicationExitInfo.REASON_CRASH, ApplicationExitInfo.REASON_CRASH_NATIVE,
        ApplicationExitInfo.REASON_ANR, ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE, ApplicationExitInfo.REASON_SIGNALED,
        ApplicationExitInfo.REASON_EXIT_SELF,
    )

    /**
     * El último cierre si fue un fallo y es posterior a `desde` (3.72.1): con
     * eso la app avisa ARRIBA y no vuelve a pedir grabar sola, que con un
     * fallo al empezar era un bucle (abrir → grabar → se cierra → abrir…).
     */
    fun falloDesde(contexto: Context, desde: Long): String? {
        if (Build.VERSION.SDK_INT < 30) return null
        val am = contexto.getSystemService(ActivityManager::class.java)
        val info = am.getHistoricalProcessExitReasons(contexto.packageName, 0, 1).firstOrNull() ?: return null
        if (info.timestamp <= desde || info.reason !in FALLOS) return null
        val memoria = if (info.pss > 0) " · usaba ${info.pss / 1024} MB" else ""
        return "${motivo(info.reason)} (código ${info.reason}, estado ${info.status})$memoria${info.description?.let { " · $it" } ?: ""}"
    }

    fun apuntarNodo(contexto: Context, codigo: Int) {
        try { File(contexto.filesDir, "salida-nodo.txt").writeText("El lector (Node) se paró con el código $codigo") } catch (e: Throwable) {}
    }
}
