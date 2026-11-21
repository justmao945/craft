package app.craft.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * File-backed storage for Craft apps, all under the app-private files dir:
 *
 *   <filesDir>/craft/apps.json                        app registry
 *   <filesDir>/craft/<appId>/workspace/**             live workspace source files
 *   <filesDir>/craft/<appId>/snapshots/<id>/files/**  immutable source snapshots
 *   <filesDir>/craft/<appId>/snapshots/<id>/meta.json { id, message, createdAt, buildId? }
 *   <filesDir>/craft/<appId>/builds/<id>/{app.js,app.css}  immutable builds
 *   <filesDir>/craft/<appId>/draft.json               { buildId }
 *   <filesDir>/craft/<appId>/release.json             { buildId }
 *   <filesDir>/craft/agent-config.json                { apiKey(encrypted), baseUrl, model, reasoningEffort }
 */
public class CraftStore {

    public static final String DEFAULT_AGENT_BASE_URL = "https://api.deepseek.com/chat/completions";
    public static final String DEFAULT_AGENT_MODEL = "deepseek-chat";

    private static final String REGISTRY_FILE = "apps.json";
    private static final String WORKSPACE_DIR = "workspace";
    private static final String SNAPSHOTS_DIR = "snapshots";
    private static final String BUILDS_DIR = "builds";
    private static final String DRAFT_POINTER = "draft.json";
    private static final String RELEASE_POINTER = "release.json";
    private static final String AGENT_CONFIG_FILE = "agent-config.json";
    private static final String META_FILE = "meta.json";
    private static final String BUILD_JS = "app.js";
    private static final String BUILD_CSS = "app.css";

    /** App ids are generated slugs; anything else is rejected. */
    private static final String APP_ID_PATTERN = "[a-z0-9]+(-[a-z0-9]+)*";
    /** File/dir segments we ever store under an app dir (uuids, generated file names). */
    private static final String SAFE_SEGMENT_PATTERN = "[A-Za-z0-9][A-Za-z0-9._-]*";

    public static class AppInfo {
        public final String id;
        public final String name;
        public final String releaseSnapshotId; // nullable
        public final long updatedAt;

        AppInfo(String id, String name, String releaseSnapshotId, long updatedAt) {
            this.id = id;
            this.name = name;
            this.releaseSnapshotId = releaseSnapshotId;
            this.updatedAt = updatedAt;
        }
    }

    public static class SnapshotInfo {
        public final String id;
        public final String message;
        public final long createdAt;
        public final String buildId; // nullable

        SnapshotInfo(String id, String message, long createdAt, String buildId) {
            this.id = id;
            this.message = message;
            this.createdAt = createdAt;
            this.buildId = buildId;
        }
    }

    public static class Build {
        public final String buildId;
        public final String js;
        public final String css;

        Build(String buildId, String js, String css) {
            this.buildId = buildId;
            this.js = js;
            this.css = css;
        }
    }

    public static class RollbackResult {
        public final AppInfo app;
        public final SnapshotInfo snapshot;

        RollbackResult(AppInfo app, SnapshotInfo snapshot) {
            this.app = app;
            this.snapshot = snapshot;
        }
    }

    private final File rootDir;

    public CraftStore(Context context) {
        rootDir = new File(context.getFilesDir(), "craft");
        if (!rootDir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            rootDir.mkdirs();
        }
    }

    // ---------------------------------------------------------------- apps

    public synchronized List<AppInfo> listApps() throws IOException {
        JSONArray apps = readRegistry().optJSONArray("apps");
        List<AppInfo> out = new ArrayList<>();
        if (apps != null) {
            for (int i = 0; i < apps.length(); i++) {
                JSONObject entry = apps.optJSONObject(i);
                if (entry != null) {
                    out.add(appFromEntry(entry));
                }
            }
        }
        return out;
    }

    /** Returns the registered app, or throws with a clear message. */
    public synchronized AppInfo requireApp(String appId) throws IOException {
        if (appId == null || !appId.matches(APP_ID_PATTERN)) {
            throw new IllegalArgumentException("Invalid app id: " + (appId == null ? "(null)" : appId));
        }
        JSONArray apps = readRegistry().optJSONArray("apps");
        if (apps != null) {
            for (int i = 0; i < apps.length(); i++) {
                JSONObject entry = apps.optJSONObject(i);
                if (entry != null && appId.equals(entry.optString("id"))) {
                    return appFromEntry(entry);
                }
            }
        }
        throw new IllegalArgumentException("Unknown app: " + appId);
    }

    public synchronized AppInfo createApp(String name) throws IOException {
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("App name is required");
        }
        String trimmed = name.trim();
        JSONObject registry = readRegistry();
        JSONArray apps = registry.optJSONArray("apps");
        if (apps == null) {
            apps = new JSONArray();
        }
        String slug = slugify(trimmed);
        String appId;
        do {
            appId = slug + "-" + UUID.randomUUID().toString().substring(0, 8);
        } while (containsApp(apps, appId));

        JSONObject entry = new JSONObject();
        try {
            entry.put("id", appId);
            entry.put("name", trimmed);
            entry.put("updatedAt", System.currentTimeMillis());
            apps.put(entry);
            registry.put("apps", apps);
        } catch (JSONException e) {
            throw new IOException("Could not build app registry entry", e);
        }
        atomicWriteString(registryFile(), registry.toString());

        File appDir = appDir(appId);
        //noinspection ResultOfMethodCallIgnored
        new File(appDir, WORKSPACE_DIR).mkdirs();
        //noinspection ResultOfMethodCallIgnored
        new File(appDir, SNAPSHOTS_DIR).mkdirs();
        //noinspection ResultOfMethodCallIgnored
        new File(appDir, BUILDS_DIR).mkdirs();
        return appFromEntry(entry);
    }

    /** Sets releaseSnapshotId (or clears it when null) and refreshes updatedAt. */
    private synchronized AppInfo updateAppRelease(String appId, String snapshotId) throws IOException {
        JSONObject registry = readRegistry();
        JSONArray apps = registry.optJSONArray("apps");
        if (apps != null) {
            for (int i = 0; i < apps.length(); i++) {
                JSONObject entry = apps.optJSONObject(i);
                if (entry != null && appId.equals(entry.optString("id"))) {
                    try {
                        if (snapshotId != null) {
                            entry.put("releaseSnapshotId", snapshotId);
                        } else {
                            entry.remove("releaseSnapshotId");
                        }
                        entry.put("updatedAt", System.currentTimeMillis());
                    } catch (JSONException e) {
                        throw new IOException("Could not update app entry", e);
                    }
                    atomicWriteString(registryFile(), registry.toString());
                    return appFromEntry(entry);
                }
            }
        }
        throw new IllegalArgumentException("Unknown app: " + appId);
    }

    private static AppInfo appFromEntry(JSONObject entry) {
        String releaseSnapshotId = entry.has("releaseSnapshotId") && !entry.isNull("releaseSnapshotId")
                ? entry.optString("releaseSnapshotId")
                : null;
        return new AppInfo(entry.optString("id"), entry.optString("name"), releaseSnapshotId, entry.optLong("updatedAt"));
    }

    private static boolean containsApp(JSONArray apps, String appId) {
        for (int i = 0; i < apps.length(); i++) {
            JSONObject entry = apps.optJSONObject(i);
            if (entry != null && appId.equals(entry.optString("id"))) {
                return true;
            }
        }
        return false;
    }

    private static String slugify(String name) {
        String slug = name.toLowerCase(Locale.US).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (slug.isEmpty()) {
            slug = "app";
        }
        if (slug.length() > 40) {
            slug = slug.substring(0, 40).replaceAll("-+$", "");
        }
        return slug;
    }

    private synchronized JSONObject readRegistry() throws IOException {
        File file = registryFile();
        if (!file.isFile()) {
            return new JSONObject();
        }
        try {
            return new JSONObject(readString(file));
        } catch (JSONException e) {
            throw new IOException("Corrupted app registry: " + REGISTRY_FILE, e);
        }
    }

    private File registryFile() {
        return new File(rootDir, REGISTRY_FILE);
    }

    // ------------------------------------------------------------ workspace

    /** All workspace files as {relativePath -> content}. Includes app.json if present. */
    public JSONObject workspaceFiles(String appId) throws IOException, JSONException {
        requireApp(appId);
        JSONObject files = new JSONObject();
        File workspace = workspaceDir(appId);
        collectFiles(workspace, "", files);
        return files;
    }

    /** Sorted relative workspace paths. */
    public List<String> listWorkspaceFiles(String appId) throws IOException {
        requireApp(appId);
        List<String> out = new ArrayList<>();
        File workspace = workspaceDir(appId);
        collectPaths(workspace, "", out);
        String[] arr = out.toArray(new String[0]);
        Arrays.sort(arr);
        return Arrays.asList(arr);
    }

    public String readFile(String appId, String path) throws IOException {
        requireApp(appId);
        File file = resolveWorkspaceFile(appId, path);
        if (!file.isFile()) {
            throw new IOException("File not found: " + path);
        }
        return readString(file);
    }

    /** Atomic write (temp file + rename) of a single workspace file. Path traversal is rejected. */
    public void writeFile(String appId, String path, String content) throws IOException {
        requireApp(appId);
        File file = resolveWorkspaceFile(appId, path);
        atomicWriteString(file, content == null ? "" : content);
    }

    private File workspaceDir(String appId) {
        return new File(appDir(appId), WORKSPACE_DIR);
    }

    private File appDir(String appId) {
        return new File(rootDir, appId);
    }

    private File resolveWorkspaceFile(String appId, String relPath) throws IOException {
        if (relPath == null || relPath.trim().isEmpty()) {
            throw new IllegalArgumentException("Path must not be empty");
        }
        if (relPath.indexOf('\u0000') >= 0) {
            throw new IllegalArgumentException("Invalid path: " + relPath);
        }
        if (relPath.startsWith("/") || relPath.indexOf('\\') >= 0) {
            throw new IllegalArgumentException("Invalid path: " + relPath);
        }
        File workspace = workspaceDir(appId);
        File target = new File(workspace, relPath);
        String canonical = target.getCanonicalPath();
        String base = workspace.getCanonicalPath() + File.separator;
        if (!canonical.equals(workspace.getCanonicalPath()) && !canonical.startsWith(base)) {
            throw new IllegalArgumentException("Path escapes the app workspace: " + relPath);
        }
        return target;
    }

    private void collectFiles(File dir, String prefix, JSONObject files) throws IOException, JSONException {
        File[] kids = dir.listFiles();
        if (kids == null) {
            return;
        }
        Arrays.sort(kids, BY_NAME);
        for (File kid : kids) {
            String rel = prefix.isEmpty() ? kid.getName() : prefix + "/" + kid.getName();
            if (kid.isDirectory()) {
                collectFiles(kid, rel, files);
            } else if (kid.isFile()) {
                files.put(rel, readString(kid));
            }
        }
    }

    private void collectPaths(File dir, String prefix, List<String> out) {
        File[] kids = dir.listFiles();
        if (kids == null) {
            return;
        }
        Arrays.sort(kids, BY_NAME);
        for (File kid : kids) {
            String rel = prefix.isEmpty() ? kid.getName() : prefix + "/" + kid.getName();
            if (kid.isDirectory()) {
                collectPaths(kid, rel, out);
            } else if (kid.isFile()) {
                out.add(rel);
            }
        }
    }

    private static final Comparator<File> BY_NAME = new Comparator<File>() {
        @Override
        public int compare(File a, File b) {
            return a.getName().compareTo(b.getName());
        }
    };

    // ------------------------------------------------------------ snapshots

    /** Immutable copy of the workspace. buildId attaches a stored build to this snapshot. */
    public SnapshotInfo createSnapshot(String appId, String message, String buildId) throws IOException, JSONException {
        requireApp(appId);
        String snapshotId = UUID.randomUUID().toString();
        File filesDir = new File(new File(snapshotsDir(appId), snapshotId), "files");
        copyDir(workspaceDir(appId), filesDir);

        JSONObject meta = new JSONObject();
        meta.put("id", snapshotId);
        meta.put("message", message == null ? "" : message);
        meta.put("createdAt", System.currentTimeMillis());
        if (buildId != null) {
            meta.put("buildId", buildId);
        }
        atomicWriteString(metaFile(appId, snapshotId), meta.toString());
        return snapshotFromMeta(meta);
    }

    /** Snapshots, newest first. */
    public List<SnapshotInfo> listSnapshots(String appId) throws IOException, JSONException {
        requireApp(appId);
        File[] snaps = snapshotsDir(appId).listFiles();
        List<SnapshotInfo> out = new ArrayList<>();
        if (snaps != null) {
            for (File snap : snaps) {
                File metaFile = new File(snap, META_FILE);
                if (!metaFile.isFile()) {
                    continue;
                }
                try {
                    out.add(snapshotFromMeta(new JSONObject(readString(metaFile))));
                } catch (JSONException ignored) {
                    // skip unreadable snapshot metadata
                }
            }
        }
        out.sort(SNAPSHOT_NEWEST_FIRST);
        return out;
    }

    public JSONObject readSnapshotMeta(String appId, String snapshotId) throws IOException, JSONException {
        checkSegment(snapshotId, "snapshot id");
        File metaFile = metaFile(appId, snapshotId);
        if (!metaFile.isFile()) {
            throw new IllegalArgumentException("Unknown snapshot: " + snapshotId);
        }
        return new JSONObject(readString(metaFile));
    }

    private static SnapshotInfo snapshotFromMeta(JSONObject meta) {
        String buildId = meta.has("buildId") && !meta.isNull("buildId") ? meta.optString("buildId") : null;
        return new SnapshotInfo(meta.optString("id"), meta.optString("message"), meta.optLong("createdAt"), buildId);
    }

    private File snapshotsDir(String appId) {
        return new File(appDir(appId), SNAPSHOTS_DIR);
    }

    private File metaFile(String appId, String snapshotId) {
        return new File(new File(snapshotsDir(appId), snapshotId), META_FILE);
    }

    private static final Comparator<SnapshotInfo> SNAPSHOT_NEWEST_FIRST = new Comparator<SnapshotInfo>() {
        @Override
        public int compare(SnapshotInfo a, SnapshotInfo b) {
            return Long.compare(b.createdAt, a.createdAt);
        }
    };

    // --------------------------------------------------------------- builds

    /**
     * Stores an immutable build under builds/<buildId>. When {@code draft} is true the draft
     * pointer is updated. When {@code snapshotId} is given, the build id is attached to that
     * snapshot's metadata.
     */
    public String saveBuild(String appId, String snapshotId, String js, String css, boolean draft)
            throws IOException, JSONException {
        requireApp(appId);
        String buildId = UUID.randomUUID().toString();
        File buildDir = new File(buildsDir(appId), buildId);
        if (!buildDir.exists() && !buildDir.mkdirs()) {
            throw new IOException("Could not create build directory");
        }
        atomicWriteString(new File(buildDir, BUILD_JS), js == null ? "" : js);
        atomicWriteString(new File(buildDir, BUILD_CSS), css == null ? "" : css);

        if (draft) {
            JSONObject pointer = new JSONObject();
            pointer.put("buildId", buildId);
            atomicWriteString(new File(appDir(appId), DRAFT_POINTER), pointer.toString());
        }
        if (snapshotId != null && !snapshotId.isEmpty()) {
            JSONObject meta = readSnapshotMeta(appId, snapshotId);
            meta.put("buildId", buildId);
            atomicWriteString(metaFile(appId, snapshotId), meta.toString());
        }
        return buildId;
    }

    public Build getBuild(String appId, String buildId) throws IOException {
        requireApp(appId);
        checkSegment(buildId, "build id");
        File buildDir = new File(buildsDir(appId), buildId);
        if (!buildDir.isDirectory()) {
            throw new IllegalArgumentException("Unknown build: " + buildId);
        }
        File jsFile = new File(buildDir, BUILD_JS);
        File cssFile = new File(buildDir, BUILD_CSS);
        if (!jsFile.isFile() || !cssFile.isFile()) {
            throw new IllegalArgumentException("Build is incomplete: " + buildId);
        }
        return new Build(buildId, readString(jsFile), readString(cssFile));
    }

    /** draft/release build; rejects clearly when the pointer is missing. */
    public Build getBuildFor(String appId, String environment) throws IOException, JSONException {
        requireApp(appId);
        String env = environment == null ? "" : environment;
        if (!"draft".equals(env) && !"release".equals(env)) {
            throw new IllegalArgumentException("Unknown environment: " + env);
        }
        String buildId = pointerBuildId(appId, env);
        if (buildId == null) {
            if ("draft".equals(env)) {
                throw new IllegalStateException("No draft build available for app " + appId
                        + ". Save a build with draft:true first.");
            }
            throw new IllegalStateException("No release build available for app " + appId
                    + ". Publish a snapshot first.");
        }
        return getBuild(appId, buildId);
    }

    private String pointerBuildId(String appId, String environment) throws IOException {
        File pointer = new File(appDir(appId), "draft".equals(environment) ? DRAFT_POINTER : RELEASE_POINTER);
        if (!pointer.isFile()) {
            return null;
        }
        try {
            JSONObject obj = new JSONObject(readString(pointer));
            String buildId = obj.optString("buildId", "");
            return buildId.isEmpty() ? null : buildId;
        } catch (JSONException e) {
            return null;
        }
    }

    /** Publishes a snapshot: requires a stored build, updates the release pointer. */
    public AppInfo publish(String appId, String snapshotId) throws IOException, JSONException {
        requireApp(appId);
        JSONObject meta = readSnapshotMeta(appId, snapshotId);
        String buildId = meta.has("buildId") && !meta.isNull("buildId") ? meta.optString("buildId") : null;
        if (buildId == null || buildId.isEmpty()) {
            throw new IllegalStateException("Snapshot " + snapshotId
                    + " has no stored build. Save a build with this snapshotId before publishing.");
        }
        JSONObject pointer = new JSONObject();
        pointer.put("buildId", buildId);
        atomicWriteString(new File(appDir(appId), RELEASE_POINTER), pointer.toString());
        return updateAppRelease(appId, snapshotId);
    }

    /**
     * Copies the target snapshot source into the workspace, creates a new snapshot
     * ("Rollback to <id>") associated with the target build, and makes it the release.
     */
    public RollbackResult rollback(String appId, String snapshotId) throws IOException, JSONException {
        requireApp(appId);
        JSONObject targetMeta = readSnapshotMeta(appId, snapshotId);
        String targetBuildId = targetMeta.has("buildId") && !targetMeta.isNull("buildId")
                ? targetMeta.optString("buildId")
                : null;

        File sourceFiles = new File(new File(snapshotsDir(appId), snapshotId), "files");
        File workspace = workspaceDir(appId);
        deleteRecursively(workspace);
        if (!workspace.mkdirs()) {
            throw new IOException("Could not recreate workspace directory");
        }
        copyDir(sourceFiles, workspace);

        SnapshotInfo snapshot = createSnapshot(appId, "Rollback to " + snapshotId, targetBuildId);
        if (targetBuildId != null) {
            JSONObject pointer = new JSONObject();
            pointer.put("buildId", targetBuildId);
            atomicWriteString(new File(appDir(appId), RELEASE_POINTER), pointer.toString());
        }
        AppInfo app = updateAppRelease(appId, snapshot.id);
        return new RollbackResult(app, snapshot);
    }

    private File buildsDir(String appId) {
        return new File(appDir(appId), BUILDS_DIR);
    }

    private static void checkSegment(String value, String what) {
        if (value == null || !value.matches(SAFE_SEGMENT_PATTERN)) {
            throw new IllegalArgumentException("Invalid " + what + ": " + value);
        }
    }

    // -------------------------------------------------------- agent config

    /**
     * Stores agent configuration. baseUrl/model/reasoningEffort are stored as plaintext; the API key is
     * AES/GCM encrypted with an Android Keystore key and never logged. Missing optional
     * fields keep their previous values.
     */
    public synchronized void setAgentConfig(String apiKey, String baseUrl, String model, String reasoningEffort)
            throws IOException, GeneralSecurityException, JSONException {
        JSONObject config = readAgentConfig();
        if (apiKey != null && !apiKey.isEmpty()) {
            config.put("apiKey", AgentCrypto.encrypt(apiKey));
        }
        if (baseUrl != null && !baseUrl.isEmpty()) {
            config.put("baseUrl", baseUrl);
        }
        if (model != null && !model.isEmpty()) {
            config.put("model", model);
        }
        if (reasoningEffort != null && !reasoningEffort.isEmpty()) {
            config.put("reasoningEffort", reasoningEffort);
        }
        atomicWriteString(agentConfigFile(), config.toString());
    }

    public synchronized JSONObject getAgentConfig() throws IOException, GeneralSecurityException, JSONException {
        JSONObject config = readAgentConfig();
        JSONObject out = new JSONObject();

        String encrypted = config.optString("apiKey", "");
        String apiKey = "";
        if (!encrypted.isEmpty()) {
            apiKey = AgentCrypto.decrypt(encrypted);
        }
        out.put("apiKey", apiKey);

        String baseUrl = config.optString("baseUrl", "");
        out.put("baseUrl", baseUrl.isEmpty() ? DEFAULT_AGENT_BASE_URL : baseUrl);

        String model = config.optString("model", "");
        out.put("model", model.isEmpty() ? DEFAULT_AGENT_MODEL : model);
        out.put("reasoningEffort", config.optString("reasoningEffort", "high"));
        return out;
    }

    private JSONObject readAgentConfig() throws IOException {
        File file = agentConfigFile();
        if (!file.isFile()) {
            return new JSONObject();
        }
        try {
            return new JSONObject(readString(file));
        } catch (JSONException e) {
            throw new IOException("Corrupted agent config: " + AGENT_CONFIG_FILE, e);
        }
    }

    private File agentConfigFile() {
        return new File(rootDir, AGENT_CONFIG_FILE);
    }

    // --------------------------------------------------------------- io

    private static void atomicWriteString(File target, String content) throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Could not create directory: " + parent);
        }
        File temp = new File(parent, target.getName() + ".tmp-" + UUID.randomUUID());
        FileOutputStream fos = new FileOutputStream(temp);
        try {
            fos.write(content.getBytes(StandardCharsets.UTF_8));
            fos.getFD().sync();
        } finally {
            fos.close();
        }
        if (target.exists() && !target.delete()) {
            //noinspection ResultOfMethodCallIgnored
            temp.delete();
            throw new IOException("Could not replace file: " + target);
        }
        if (!temp.renameTo(target)) {
            //noinspection ResultOfMethodCallIgnored
            temp.delete();
            throw new IOException("Could not finalize write: " + target);
        }
    }

    private static String readString(File file) throws IOException {
        FileInputStream fis = new FileInputStream(file);
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = fis.read(buffer)) != -1) {
                bos.write(buffer, 0, read);
            }
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            fis.close();
        }
    }

    private static void copyDir(File source, File target) throws IOException {
        if (!source.exists()) {
            //noinspection ResultOfMethodCallIgnored
            target.mkdirs();
            return;
        }
        if (!target.exists() && !target.mkdirs()) {
            throw new IOException("Could not create directory: " + target);
        }
        File[] kids = source.listFiles();
        if (kids == null) {
            return;
        }
        for (File kid : kids) {
            File dst = new File(target, kid.getName());
            if (kid.isDirectory()) {
                copyDir(kid, dst);
            } else {
                copyFile(kid, dst);
            }
        }
    }

    private static void copyFile(File source, File target) throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("Could not create directory: " + parent);
        }
        FileInputStream in = new FileInputStream(source);
        try {
            FileOutputStream out = new FileOutputStream(target);
            try {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
            } finally {
                out.close();
            }
        } finally {
            in.close();
        }
    }

    private static void deleteRecursively(File file) {
        File[] kids = file.listFiles();
        if (kids != null) {
            for (File kid : kids) {
                deleteRecursively(kid);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
