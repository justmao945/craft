package app.craft.android;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.Iterator;
import java.util.List;

/**
 * Source control + storage bridge for Craft apps: workspaces, immutable source
 * snapshots, immutable builds, draft/release pointers and agent configuration.
 */
@CapacitorPlugin(name = "CraftProject")
public class CraftProjectPlugin extends Plugin {

    private CraftStore store;

    @Override
    public void load() {
        store = new CraftStore(getContext());
    }

    // ------------------------------------------------------------------ apps

    @PluginMethod
    public void listApps(PluginCall call) {
        try {
            JSArray apps = new JSArray();
            for (CraftStore.AppInfo app : store.listApps()) {
                apps.put(appJson(app));
            }
            JSObject ret = new JSObject();
            ret.put("apps", apps);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not list apps: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void createApp(PluginCall call) {
        String name = call.getString("name");
        if (name == null || name.trim().isEmpty()) {
            call.reject("name is required");
            return;
        }
        try {
            CraftStore.AppInfo app = store.createApp(name);
            JSObject ret = new JSObject();
            ret.put("app", appJson(app));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not create app: " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------------- workspace

    @PluginMethod
    public void getWorkspace(PluginCall call) {
        String appId = requiredString(call, "appId", "appId");
        if (appId == null) {
            return;
        }
        try {
            CraftStore.AppInfo app = store.requireApp(appId);
            JSONObject files = store.workspaceFiles(appId);
            JSObject filesOut = new JSObject();
            Iterator<String> keys = files.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                filesOut.put(key, files.getString(key));
            }
            JSObject ret = new JSObject();
            ret.put("app", appJson(app));
            ret.put("files", filesOut);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read workspace: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        String appId = requiredString(call, "appId", "appId");
        if (appId == null) {
            return;
        }
        try {
            List<String> files = store.listWorkspaceFiles(appId);
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
        String appId = requiredString(call, "appId", "appId");
        String path = requiredString(call, "path", "path");
        if (appId == null || path == null) {
            return;
        }
        try {
            String content = store.readFile(appId, path);
            JSObject ret = new JSObject();
            ret.put("content", content);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read file: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String appId = requiredString(call, "appId", "appId");
        String path = requiredString(call, "path", "path");
        String content = call.getString("content");
        if (appId == null || path == null || content == null) {
            if (content == null && appId != null && path != null) {
                call.reject("content is required");
            }
            return;
        }
        try {
            store.writeFile(appId, path, content);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not write file: " + e.getMessage(), e);
        }
    }

    // ------------------------------------------------------------- snapshots

    @PluginMethod
    public void createSnapshot(PluginCall call) {
        String appId = requiredString(call, "appId", "appId");
        if (appId == null) {
            return;
        }
        String message = call.getString("message", "");
        try {
            CraftStore.SnapshotInfo snapshot = store.createSnapshot(appId, message, null);
            JSObject ret = new JSObject();
            ret.put("snapshot", snapshotJson(snapshot));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not create snapshot: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void listSnapshots(PluginCall call) {
        String appId = requiredString(call, "appId", "appId");
        if (appId == null) {
            return;
        }
        try {
            JSArray arr = new JSArray();
            for (CraftStore.SnapshotInfo snapshot : store.listSnapshots(appId)) {
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
        String appId = requiredString(call, "appId", "appId");
        String js = call.getString("js");
        String css = call.getString("css");
        if (appId == null || js == null || css == null) {
            if (appId != null) {
                call.reject(js == null ? "js is required" : "css is required");
            }
            return;
        }
        String snapshotId = call.getString("snapshotId");
        boolean draft = call.getBoolean("draft", Boolean.FALSE);
        try {
            String buildId = store.saveBuild(appId, snapshotId, js, css, draft);
            JSObject ret = new JSObject();
            ret.put("buildId", buildId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save build: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getDraftBuild(PluginCall call) {
        getBuildByEnvironment(call, "draft");
    }

    @PluginMethod
    public void getReleaseBuild(PluginCall call) {
        getBuildByEnvironment(call, "release");
    }

    private void getBuildByEnvironment(PluginCall call, String environment) {
        String appId = requiredString(call, "appId", "appId");
        if (appId == null) {
            return;
        }
        try {
            CraftStore.Build build = store.getBuildFor(appId, environment);
            JSObject ret = new JSObject();
            ret.put("buildId", build.buildId);
            ret.put("js", build.js);
            ret.put("css", build.css);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    // ------------------------------------------------------- publish / rollback

    @PluginMethod
    public void publish(PluginCall call) {
        String appId = requiredString(call, "appId", "appId");
        String snapshotId = requiredString(call, "snapshotId", "snapshotId");
        if (appId == null || snapshotId == null) {
            return;
        }
        try {
            CraftStore.AppInfo app = store.publish(appId, snapshotId);
            JSObject ret = new JSObject();
            ret.put("app", appJson(app));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not publish: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void rollback(PluginCall call) {
        String appId = requiredString(call, "appId", "appId");
        String snapshotId = requiredString(call, "snapshotId", "snapshotId");
        if (appId == null || snapshotId == null) {
            return;
        }
        try {
            CraftStore.RollbackResult result = store.rollback(appId, snapshotId);
            JSObject ret = new JSObject();
            ret.put("app", appJson(result.app));
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
        try {
            store.setAgentConfig(apiKey, baseUrl, model, reasoningEffort);
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
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read agent config: " + e.getMessage(), e);
        }
    }

    // ---------------------------------------------------------- conversation

    @PluginMethod
    public void getConversation(PluginCall call) {
        String appId = requiredString(call, "appId", "appId");
        if (appId == null) {
            return;
        }
        try {
            call.resolve(new JSObject().put("json", store.readConversation(appId)));
        } catch (Exception e) {
            call.reject("Could not read conversation: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void saveConversation(PluginCall call) {
        String appId = requiredString(call, "appId", "appId");
        if (appId == null) {
            return;
        }
        String json = call.getString("json");
        if (json == null) {
            call.reject("json is required");
            return;
        }
        try {
            store.writeConversation(appId, json);
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("Could not save conversation: " + e.getMessage(), e);
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

    private static JSObject appJson(CraftStore.AppInfo app) {
        JSObject obj = new JSObject();
        obj.put("id", app.id);
        obj.put("name", app.name);
        obj.put("updatedAt", app.updatedAt);
        if (app.releaseSnapshotId != null) {
            obj.put("releaseSnapshotId", app.releaseSnapshotId);
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
