package es.srchipiron.lector

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Que la app se actualice sola (3.62.0; sin preguntar desde 3.64.0): mira
 * la última versión publicada en GitHub y, si es más nueva y NO está
 * leyendo (actualizar cierra la app: en mitad de una partida se perdería
 * la lectura), la descarga y la instala. Desde Android 12, si la última
 * instalación la hizo la propia app, no hace falta confirmar
 * (USER_ACTION_NOT_REQUIRED); la primera vez sí. Android solo la instala si
 * va firmada con la misma clave: nadie más puede colar otra app por aquí.
 */
object Actualizar {
    private const val API = "https://api.github.com/repos/srchipiron/mobile-legends-pick-assist/releases/latest"

    data class Nueva(val version: String, val url: String)

    private fun numeros(v: String) = v.removePrefix("lector-v").split(".").map { it.toIntOrNull() ?: 0 }

    fun esMasNueva(otra: String, mia: String): Boolean {
        val a = numeros(otra); val b = numeros(mia)
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }; val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    /** La publicada, si es más nueva que esta; null si no (o sin red). Bloquea: llamar fuera del hilo principal. */
    fun buscar(contexto: Context): Nueva? {
        val mia = contexto.packageManager.getPackageInfo(contexto.packageName, 0).versionName ?: return null
        val c = URL(API).openConnection() as HttpURLConnection
        c.connectTimeout = 5000; c.readTimeout = 8000
        c.setRequestProperty("Accept", "application/vnd.github+json")
        c.setRequestProperty("User-Agent", "lector-mlbb")
        val j = try { if (c.responseCode == 200) JSONObject(c.inputStream.bufferedReader().readText()) else null } finally { c.disconnect() } ?: return null
        val tag = j.optString("tag_name")
        if (!tag.startsWith("lector-v") || !esMasNueva(tag, mia)) return null
        val activos = j.optJSONArray("assets") ?: return null
        for (i in 0 until activos.length()) {
            val a = activos.getJSONObject(i)
            val url = a.optString("browser_download_url")
            if (a.optString("name") == "lector-mlbb.apk" && url.startsWith("https://github.com/srchipiron/mobile-legends-pick-assist/")) return Nueva(tag.removePrefix("lector-v"), url)
        }
        return null
    }

    /** Descarga e instala. Bloquea: fuera del hilo principal. */
    fun instalar(contexto: Context, nueva: Nueva) {
        val instalador = contexto.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(contexto.packageName)
            if (android.os.Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = instalador.createSession(params)
        instalador.openSession(id).use { sesion ->
            val c = URL(nueva.url).openConnection() as HttpURLConnection
            c.connectTimeout = 10000; c.readTimeout = 60000
            c.instanceFollowRedirects = true
            c.inputStream.use { e -> sesion.openWrite("lector-mlbb.apk", 0, -1).use { s -> e.copyTo(s); sesion.fsync(s) } }
            val aviso = PendingIntent.getBroadcast(contexto, id, Intent(contexto, Instalado::class.java), PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            sesion.commit(aviso.intentSender)
        }
    }

    /** Busca y, si hay una más nueva y no está leyendo, la instala. Una vez por versión y arranque. Bloquea. */
    @Volatile private var intentada: String? = null
    fun sola(contexto: Context): Nueva? {
        val n = buscar(contexto) ?: return null
        if (!Lector.grabando && intentada != n.version) { intentada = n.version; instalar(contexto, n) }
        return n
    }

    /** Si algo falla, el enlace en el navegador, como se hacía a mano. */
    fun enNavegador(contexto: Context) {
        contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/srchipiron/mobile-legends-pick-assist/releases/latest/download/lector-mlbb.apk")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/** Lo que contesta el instalador: si hace falta tu confirmación, la pide. */
class Instalado : BroadcastReceiver() {
    override fun onReceive(contexto: Context, intent: Intent) {
        if (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999) == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            @Suppress("DEPRECATION")
            val confirmar = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
            contexto.startActivity(confirmar.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
