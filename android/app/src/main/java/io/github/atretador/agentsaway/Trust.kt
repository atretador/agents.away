package io.github.atretador.agentsaway

import android.net.Uri
import okhttp3.OkHttpClient
import java.io.ByteArrayInputStream
import java.net.InetAddress
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * Each PC has its own private CA (bin/agents-away-certs). Instead of asking the user to install it in Android's
 * certificate store, the app pins it per profile: a server certificate is accepted only if that profile's CA
 * signed it, it's within its validity period, and it names the address we connected to.
 */
object Trust {
    fun parseCert(pemOrDer: ByteArray): X509Certificate =
        CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(pemOrDer)) as X509Certificate

    fun parseCert(pem: String): X509Certificate = parseCert(pem.toByteArray())

    fun toPem(c: X509Certificate): String =
        "-----BEGIN CERTIFICATE-----\n" + android.util.Base64.encodeToString(c.encoded, android.util.Base64.DEFAULT) + "-----END CERTIFICATE-----\n"

    fun fingerprint(c: X509Certificate): String =
        MessageDigest.getInstance("SHA-256").digest(c.encoded).joinToString("") { "%02x".format(it) }

    /** True if `leaf` was issued by `ca`, is currently valid, and lists `host` (an IP or a name) as a SAN. */
    fun verifyServer(leaf: X509Certificate, ca: X509Certificate, host: String): Boolean = try {
        leaf.checkValidity()
        leaf.verify(ca.publicKey)
        sanMatches(leaf, host)
    } catch (e: Exception) { false }

    fun sanMatches(leaf: X509Certificate, host: String): Boolean {
        val sans = leaf.subjectAlternativeNames ?: return false
        val ip = runCatching { if (host.any { it.isLetter() } && !host.contains(':')) null else InetAddress.getByName(host) }.getOrNull()
        for (san in sans) {
            val type = san[0] as Int
            val value = san[1]?.toString() ?: continue
            if (type == 7 && ip != null && runCatching { InetAddress.getByName(value) == ip }.getOrDefault(false)) return true
            if (type == 2 && ip == null && value.equals(host, ignoreCase = true)) return true
        }
        return false
    }

    private class PinnedTrustManager(private val ca: X509Certificate) : X509TrustManager {
        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = throw CertificateException("no client auth")
        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            val leaf = chain?.firstOrNull() ?: throw CertificateException("no certificate")
            try { leaf.checkValidity(); leaf.verify(ca.publicKey) } catch (e: Exception) { throw CertificateException("not signed by this PC's CA", e) }
        }
        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf(ca)
    }

    /** HTTP client that trusts only this profile's CA (plus the SAN check for the address used). */
    fun client(caPem: String, readTimeoutSec: Long = 20, pingSec: Long = 0): OkHttpClient {
        val ca = parseCert(caPem)
        val tm = PinnedTrustManager(ca)
        val ctx = SSLContext.getInstance("TLS").apply { init(null, arrayOf(tm), SecureRandom()) }
        return OkHttpClient.Builder()
            .sslSocketFactory(ctx.socketFactory, tm)
            .hostnameVerifier(HostnameVerifier { host, session ->
                val leaf = session.peerCertificates.firstOrNull() as? X509Certificate
                leaf != null && sanMatches(leaf, host)
            })
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(readTimeoutSec, TimeUnit.SECONDS)
            .pingInterval(pingSec, TimeUnit.SECONDS)
            .followRedirects(false)
            .build()
    }

    /** Only for downloading a PC's CA during pairing: the CA is then checked against the fingerprint in the
     *  pairing QR, which is what actually authenticates it. Nothing else is ever sent over this client. */
    fun bootstrapClient(): OkHttpClient {
        val tm = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = throw CertificateException()
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        }
        val ctx = SSLContext.getInstance("TLS").apply { init(null, arrayOf(tm), SecureRandom()) }
        return OkHttpClient.Builder().sslSocketFactory(ctx.socketFactory, tm).hostnameVerifier { _, _ -> true }
            .connectTimeout(6, TimeUnit.SECONDS).readTimeout(10, TimeUnit.SECONDS).followRedirects(false).build()
    }

    fun host(url: String): String = Uri.parse(url).host ?: ""
}
