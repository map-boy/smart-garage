package rw.smartgarage.reception

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.PersistentCacheSettings

class ReceptionApp : Application() {
    override fun onCreate() {
        super.onCreate()

        if (FirebaseApp.getApps(this).isEmpty()) {
            FirebaseApp.initializeApp(
                this,
                FirebaseOptions.Builder()
                    .setProjectId(BuildConfig.FB_PROJECT_ID)
                    .setApplicationId(BuildConfig.FB_APP_ID)
                    .setApiKey(BuildConfig.FB_API_KEY)
                    .setGcmSenderId(BuildConfig.FB_SENDER_ID)
                    .setStorageBucket(BuildConfig.FB_STORAGE_BUCKET)
                    .build()
            )
        }

        /*
         * Unlimited local cache, on purpose.
         *
         * The gate is where signal is worst on the whole property. Firestore
         * accepts a write into its local store immediately and pushes it when
         * the network returns; capping the cache would risk evicting a
         * check-in that has not yet reached the server.
         */
        FirebaseFirestore.getInstance().firestoreSettings =
            FirebaseFirestoreSettings.Builder()
                .setLocalCacheSettings(
                    PersistentCacheSettings.newBuilder()
                        .setSizeBytes(FirebaseFirestoreSettings.CACHE_SIZE_UNLIMITED)
                        .build()
                )
                .build()
    }
}