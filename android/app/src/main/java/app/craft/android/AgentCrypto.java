package app.craft.android;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * AES/GCM encryption backed by an Android Keystore key. Used to keep the agent API key
 * encrypted at rest; the plaintext key is never logged and never persisted.
 */
final class AgentCrypto {

    private static final String KEY_ALIAS = "craft-agent-key";
    private static final int IV_LENGTH = 12;
    private static final int GCM_TAG_BITS = 128;

    private AgentCrypto() {
    }

    /** Returns base64(iv || ciphertext) for the given plaintext. */
    static String encrypt(String plaintext) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        byte[] out = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, out, 0, iv.length);
        System.arraycopy(ciphertext, 0, out, iv.length, ciphertext.length);
        return Base64.encodeToString(out, Base64.NO_WRAP);
    }

    /** Inverse of {@link #encrypt(String)}. */
    static String decrypt(String blob) throws GeneralSecurityException {
        byte[] all = Base64.decode(blob, Base64.NO_WRAP);
        if (all.length <= IV_LENGTH) {
            throw new GeneralSecurityException("Encrypted API key is malformed");
        }
        byte[] iv = Arrays.copyOfRange(all, 0, IV_LENGTH);
        byte[] ciphertext = Arrays.copyOfRange(all, IV_LENGTH, all.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    private static SecretKey getOrCreateKey() throws GeneralSecurityException {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        try {
            keyStore.load(null);
        } catch (IOException error) {
            throw new GeneralSecurityException("Could not load Android Keystore", error);
        }
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build());
            generator.generateKey();
        }
        SecretKey key = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        if (key == null) {
            throw new GeneralSecurityException("Craft agent keystore key is unavailable");
        }
        return key;
    }
}
