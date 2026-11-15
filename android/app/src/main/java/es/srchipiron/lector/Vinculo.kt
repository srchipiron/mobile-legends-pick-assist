package es.srchipiron.lector

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.net.Inet4Address
import java.security.SecureRandom

/**
 * Vincular el móvil: el código de la tablet (10 letras, se crea una vez y se
 * guarda), su IP en la wifi y el QR con el enlace que abre Pick Assist en el
 * móvil ya vinculado. El código viaja en claro por la wifi (no hay HTTPS con
 * una IP privada): solo en una wifi de confianza.
 */
object Vinculo {
    private const val LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    const val APP = "https://srchipiron.github.io/mobile-legends-pick-assist/"

    fun codigo(contexto: Context): String {
        val prefs = contexto.getSharedPreferences("lector", Context.MODE_PRIVATE)
        prefs.getString("codigo", null)?.let { return it }
        val azar = SecureRandom()
        val nuevo = (1..10).map { LETRAS[azar.nextInt(LETRAS.length)] }.joinToString("")
        prefs.edit().putString("codigo", nuevo).apply()
        return nuevo
    }

    fun nuevo(contexto: Context) { contexto.getSharedPreferences("lector", Context.MODE_PRIVATE).edit().remove("codigo").apply() }

    /** La IPv4 de la tablet en la wifi, o null sin red. */
    fun ip(contexto: Context): String? {
        val red = contexto.getSystemService(ConnectivityManager::class.java)
        val enlace = red.getLinkProperties(red.activeNetwork) ?: return null
        return enlace.linkAddresses.map { it.address }.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
    }

    /** El enlace que vincula el móvil (lo lee `lectorTabletDeEnlace` de la app), o null sin wifi. */
    fun enlace(contexto: Context): String? = ip(contexto)?.let { "${APP}#lector=$it:${Cliente.PUERTO}&codigo=${codigo(contexto)}" }

    fun qr(texto: String): Bitmap {
        val m = QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, 512, 512)
        val bmp = Bitmap.createBitmap(m.width, m.height, Bitmap.Config.RGB_565)
        for (x in 0 until m.width) for (y in 0 until m.height) bmp.setPixel(x, y, if (m[x, y]) Color.BLACK else Color.WHITE)
        return bmp
    }
}
