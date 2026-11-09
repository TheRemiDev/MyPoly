plugins {
    id("com.android.application")
}

// Adresse du site : -PmypolyUrl=https://jeu.exemple.fr (ou gradle.properties, ou variable MYPOLY_URL)
val siteUrl: String = ((project.findProperty("mypolyUrl") as String?)?.takeIf { it.isNotBlank() }
    ?: System.getenv("MYPOLY_URL") ?: "").trim().trimEnd('/')
val siteHost: String = Regex("^https?://([^/:]+)").find(siteUrl)?.groupValues?.get(1) ?: "mypoly.invalid"
val appVersionCode: Int = ((project.findProperty("versionCode") as String?) ?: System.getenv("VERSION_CODE") ?: "1").toInt()
val appVersionName: String = (project.findProperty("versionName") as String?) ?: System.getenv("VERSION_NAME") ?: "1.0"

android {
    namespace = "fr.mypoly.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "fr.mypoly.app"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
        buildConfigField("String", "SITE_URL", "\"$siteUrl\"")
        manifestPlaceholders["siteHost"] = siteHost
    }

    buildFeatures {
        buildConfig = true
    }

    // Signature de publication : fournie par variables d'environnement (CI) ; sinon clé de débogage
    val ks = System.getenv("ANDROID_KEYSTORE_FILE")
    signingConfigs {
        if (ks != null && file(ks).exists()) {
            create("release") {
                storeFile = file(ks)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
