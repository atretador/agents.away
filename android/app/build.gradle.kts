plugins {
    id("com.android.application")
}

// Release signing comes from the environment (CI secrets, or a local keystore); without it, release builds
// are left unsigned and only debug builds are installable.
val keystore = System.getenv("AWAY_KEYSTORE")

// One version for the whole project: the app takes it from package.json (1.2.3 → versionCode 10203).
val appVersion: String = Regex("\"version\"\\s*:\\s*\"([0-9]+\\.[0-9]+\\.[0-9]+)\"")
    .find(rootDir.resolve("../package.json").readText())!!.groupValues[1]
val appVersionCode = appVersion.split(".").map { it.toInt() }.let { (a, b, c) -> a * 10000 + b * 100 + c }

android {
    namespace = "io.github.atretador.agentsaway"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.atretador.agentsaway"
        minSdk = 29 // SslCertificate.getX509Certificate(), needed to verify each PC's certificate ourselves
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersion
    }

    signingConfigs {
        if (keystore != null) create("release") {
            storeFile = file(keystore)
            storePassword = System.getenv("AWAY_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("AWAY_KEY_ALIAS") ?: "agents-away"
            keyPassword = System.getenv("AWAY_KEY_PASSWORD") ?: System.getenv("AWAY_KEYSTORE_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            if (keystore != null) signingConfig = signingConfigs.getByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { buildConfig = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("com.squareup.okhttp3:okhttp:5.5.1")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
