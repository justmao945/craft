package app.craft.android;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.List;

/**
 * Source control + storage bridge for Craft gifts: workspaces, immutable source
 * snapshots, immutable builds, draft/release pointers and agent configuration.
 */
@CapacitorPlugin(name = "CraftGift")
public class CraftGiftPlugin extends Plugin {

    private CraftStore store;

    @Override
    public void load() {
        store = new CraftStore(getContext());
    }

    @PluginMethod
    public void getStorageStatus(PluginCall call) {
        boolean granted = CraftStore.hasStorageAccess(getContext());
        try {
            if (granted) store.migrateLegacyData(getContext());
            call.resolve(new JSObject()
                    .put("granted", granted)
                    .put("path", store.rootPath()));
        } catch (Exception e) {
            call.reject("Could not migrate Craft data to shared storage: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void requestStorageAccess(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (CraftStore.hasStorageAccess(getContext())) {
                call.resolve(new JSObject().put("ok", true));
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                    getActivity().startActivity(intent);
                } catch (Exception e) {
                    getActivity().startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                }
            } else {
                ActivityCompat.requestPermissions(getActivity(), new String[]{
                        android.Manifest.permission.READ_EXTERNAL_STORAGE,
                        android.Manifest.permission.WRITE_EXTERNAL_STORAGE,
                }, 410);
            }
            call.resolve(new JSObject().put("ok", true));
        });
    }

    // ----------------------------------------------------------------- gifts

    @PluginMethod
    public void listGifts(PluginCall call) {
        try {
            JSArray gifts = new JSArray();
            for (CraftStore.GiftInfo gift : store.listGifts()) {
                gifts.put(giftJson(gift));
            }
            JSObject ret = new JSObject();
            ret.put("gifts", gifts);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not list gifts: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void createGift(PluginCall call) {
        String name = call.getString("name");
        if (name == null || name.trim().isEmpty()) {
            call.reject("name is required");
            return;
        }
        try {
            CraftStore.GiftInfo gift = store.createGift(name);
            JSObject ret = new JSObject();
            ret.put("gift", giftJson(gift));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not create gift: " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------------- workspace

    @PluginMethod
    public void getWorkspace(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) {
            return;
        }
        try {
            CraftStore.GiftInfo gift = store.requireGift(giftId);
            JSONObject files = store.workspaceFiles(giftId);
            JSObject filesOut = new JSObject();
            Iterator<String> keys = files.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                filesOut.put(key, files.getString(key));
            }
            JSObject ret = new JSObject();
            ret.put("gift", giftJson(gift));
            ret.put("files", filesOut);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read workspace: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) {
            return;
        }
        try {
            List<String> files = store.listWorkspaceFiles(giftId);
            JSArray arr = new JSArray();
            for (String path : files) {
                arr.put(path);
            }
            JSObject ret = new JSObject();
            ret.put("files", arr);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not list files: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        String path = requiredString(call, "path", "path");
        if (giftId == null || path == null) {
            return;
        }
        try {
            String content = store.readFile(giftId, path);
            JSObject ret = new JSObject();
            ret.put("content", content);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read file: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        String path = requiredString(call, "path", "path");
        String content = call.getString("content");
        if (giftId == null || path == null || content == null) {
            if (content == null && giftId != null && path != null) {
                call.reject("content is required");
            }
            return;
        }
        try {
            store.writeFile(giftId, path, content);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not write file: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void listGeneralFiles(PluginCall call) {
        try {
            JSArray files = new JSArray();
            for (String path : store.listGeneralFiles()) files.put(path);
            call.resolve(new JSObject().put("files", files));
        } catch (Exception e) {
            call.reject("Could not list general workspace files: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readGeneralFile(PluginCall call) {
        String path = requiredString(call, "path", "path");
        if (path == null) return;
        try {
            call.resolve(new JSObject().put("content", store.readGeneralFile(path)));
        } catch (Exception e) {
            call.reject("Could not read general workspace file: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void writeGeneralFile(PluginCall call) {
        String path = requiredString(call, "path", "path");
        String content = call.getString("content");
        if (path == null) return;
        if (content == null) {
            call.reject("content is required");
            return;
        }
        try {
            store.writeGeneralFile(path, content);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not write general workspace file: " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------------- snapshots

    @PluginMethod
    public void createSnapshot(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) {
            return;
        }
        String message = call.getString("message", "");
        try {
            CraftStore.SnapshotInfo snapshot = store.createSnapshot(giftId, message, null);
            JSObject ret = new JSObject();
            ret.put("snapshot", snapshotJson(snapshot));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not create snapshot: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void listSnapshots(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) {
            return;
        }
        try {
            JSArray arr = new JSArray();
            for (CraftStore.SnapshotInfo snapshot : store.listSnapshots(giftId)) {
                arr.put(snapshotJson(snapshot));
            }
            JSObject ret = new JSObject();
            ret.put("snapshots", arr);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not list snapshots: " + e.getMessage(), e);
        }
    }

    // ---------------------------------------------------------------- builds

    @PluginMethod
    public void saveBuild(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        String js = call.getString("js");
        String css = call.getString("css");
        if (giftId == null || js == null || css == null) {
            if (giftId != null) {
                call.reject(js == null ? "js is required" : "css is required");
            }
            return;
        }
        String snapshotId = call.getString("snapshotId");
        boolean draft = call.getBoolean("draft", Boolean.FALSE);
        try {
            String buildId = store.saveBuild(giftId, snapshotId, js, css, draft);
            JSObject ret = new JSObject();
            ret.put("buildId", buildId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save build: " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------- publish / rollback

    @PluginMethod
    public void publish(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        String snapshotId = requiredString(call, "snapshotId", "snapshotId");
        if (giftId == null || snapshotId == null) {
            return;
        }
        try {
            CraftStore.GiftInfo gift = store.publish(giftId, snapshotId);
            JSObject ret = new JSObject();
            ret.put("gift", giftJson(gift));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not publish: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void rollback(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        String snapshotId = requiredString(call, "snapshotId", "snapshotId");
        if (giftId == null || snapshotId == null) {
            return;
        }
        try {
            CraftStore.RollbackResult result = store.rollback(giftId, snapshotId);
            JSObject ret = new JSObject();
            ret.put("gift", giftJson(result.gift));
            ret.put("snapshot", snapshotJson(result.snapshot));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not roll back: " + e.getMessage(), e);
        }
    }

    // ---------------------------------------------------------- agent config

    @PluginMethod
    public void setAgentConfig(PluginCall call) {
        String apiKey = call.getString("apiKey");
        if (apiKey == null || apiKey.isEmpty()) {
            call.reject("apiKey is required");
            return;
        }
        String baseUrl = call.getString("baseUrl");
        String model = call.getString("model");
        String reasoningEffort = call.getString("reasoningEffort");
        Integer contextWindow = call.getInt("contextWindow");
        Double compactionPercent = call.getDouble("compactionPercent");
        try {
            store.setAgentConfig(apiKey, baseUrl, model, reasoningEffort, contextWindow == null ? null : contextWindow.longValue(), compactionPercent);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not save agent config: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getAgentConfig(PluginCall call) {
        try {
            JSONObject config = store.getAgentConfig();
            JSObject ret = new JSObject();
            ret.put("apiKey", config.optString("apiKey", ""));
            ret.put("baseUrl", config.optString("baseUrl"));
            ret.put("model", config.optString("model"));
            ret.put("reasoningEffort", config.optString("reasoningEffort", "high"));
            ret.put("contextWindow", config.optLong("contextWindow", 0L));
            ret.put("compactionPercent", config.optDouble("compactionPercent", 0d));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read agent config: " + e.getMessage(), e);
        }
    }

    // ---------------------------------------------------------- conversation

    @PluginMethod
    public void getConversation(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) {
            return;
        }
        try {
            call.resolve(new JSObject().put("json", store.readConversation(giftId)));
        } catch (Exception e) {
            call.reject("Could not read conversation: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void saveConversation(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) {
            return;
        }
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        try {
            store.writeConversation(giftId, json);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not save conversation: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getGeneralConversation(PluginCall call) {
        try {
            call.resolve(new JSObject().put("json", store.readGeneralConversation()));
        } catch (Exception e) {
            call.reject("Could not read general conversation: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void saveGeneralConversation(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        try {
            store.writeGeneralConversation(json);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not save general conversation: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getModelContext(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) return;
        try {
            call.resolve(new JSObject().put("jsonl", store.readModelContext(giftId)));
        } catch (Exception e) {
            call.reject("Could not read model context: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void saveModelContext(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) return;
        try {
            store.writeModelContext(giftId, call.getString("jsonl"));
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not save model context: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void archiveModelContext(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) return;
        try {
            call.resolve(new JSObject().put("file", store.archiveModelContext(giftId, call.getString("jsonl"))));
        } catch (Exception e) {
            call.reject("Could not archive model context: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void listContextArchives(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) return;
        try {
            call.resolve(new JSObject().put("files", new JSONArray(store.listContextArchives(giftId))));
        } catch (Exception e) {
            call.reject("Could not list context archives: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readContextArchive(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        String file = requiredString(call, "file", "file");
        if (giftId == null || file == null) return;
        try {
            call.resolve(new JSObject().put("jsonl", store.readContextArchive(giftId, file)));
        } catch (Exception e) {
            call.reject("Could not read context archive: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getGeneralModelContext(PluginCall call) {
        try {
            call.resolve(new JSObject().put("jsonl", store.readGeneralModelContext()));
        } catch (Exception e) {
            call.reject("Could not read general model context: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void saveGeneralModelContext(PluginCall call) {
        try {
            store.writeGeneralModelContext(call.getString("jsonl"));
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not save general model context: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void archiveGeneralModelContext(PluginCall call) {
        try {
            call.resolve(new JSObject().put("file", store.archiveGeneralModelContext(call.getString("jsonl"))));
        } catch (Exception e) {
            call.reject("Could not archive general model context: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void listGeneralContextArchives(PluginCall call) {
        try {
            call.resolve(new JSObject().put("files", new JSONArray(store.listGeneralContextArchives())));
        } catch (Exception e) {
            call.reject("Could not list general context archives: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readGeneralContextArchive(PluginCall call) {
        String file = requiredString(call, "file", "file");
        if (file == null) return;
        try {
            call.resolve(new JSObject().put("jsonl", store.readGeneralContextArchive(file)));
        } catch (Exception e) {
            call.reject("Could not read general context archive: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void deleteGift(PluginCall call) {
        String giftId = requiredString(call, "giftId", "giftId");
        if (giftId == null) return;
        try {
            store.deleteGift(giftId);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not delete gift: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getSession(PluginCall call) {
        try {
            call.resolve(new JSObject().put("json", store.readSession()));
        } catch (Exception e) {
            call.reject("Could not read session: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void saveSession(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        try {
            store.writeSession(json);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not save session: " + e.getMessage(), e);
        }
    }

    // -------------------------------------------------------------- helpers

    private static String requiredString(PluginCall call, String key, String label) {
        String value = call.getString(key);
        if (value == null || value.isEmpty()) {
            call.reject(label + " is required");
            return null;
        }
        return value;
    }

    private static JSObject giftJson(CraftStore.GiftInfo gift) {
        JSObject obj = new JSObject();
        obj.put("id", gift.id);
        obj.put("name", gift.name);
        obj.put("updatedAt", gift.updatedAt);
        if (gift.releaseSnapshotId != null) {
            obj.put("releaseSnapshotId", gift.releaseSnapshotId);
        }
        return obj;
    }

    private static JSObject snapshotJson(CraftStore.SnapshotInfo snapshot) {
        JSObject obj = new JSObject();
        obj.put("id", snapshot.id);
        obj.put("message", snapshot.message);
        obj.put("createdAt", snapshot.createdAt);
        if (snapshot.buildId != null) {
            obj.put("buildId", snapshot.buildId);
        }
        return obj;
    }
}
