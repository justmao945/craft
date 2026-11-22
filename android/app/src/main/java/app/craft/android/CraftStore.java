package app.craft.android;

import android.content.Context;

import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.api.errors.NoHeadException;
import org.eclipse.jgit.lib.PersonIdent;
import org.eclipse.jgit.revwalk.RevCommit;

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
 * File-backed storage for Craft gifts, all under the app-private files dir:
 *
 *   <filesDir>/craft/gifts.json                       gift registry
 *   <filesDir>/craft/<giftId>/workspace/**             live workspace source files (git repo)
 *   <filesDir>/craft/<giftId>/snapshots/<id>/meta.json { id, message, createdAt, buildId? }
 *   <filesDir>/craft/<giftId>/builds/<id>/{app.js,app.css}  immutable builds
 *   <filesDir>/craft/<giftId>/draft.json               { buildId }
 *   <filesDir>/craft/<giftId>/release.json             { buildId }
 *   <filesDir>/craft/<giftId>/conversation.json        single Gift-scoped conversation history
 *   <filesDir>/craft/<giftId>/context.jsonl            full model transcript (JSONL, lossless)
 *   <filesDir>/craft/<giftId>/context-archive-<ts>.jsonl  pre-compaction raw transcripts
 *   <filesDir>/craft/.general/workspace/**             persistent general drafts and files
 *   <filesDir>/craft/.general/conversation.json        general conversation history
 *   <filesDir>/craft/.general/context.jsonl            general full model transcript
 *   <filesDir>/craft/session.json                     UI session: last project/tab, composer drafts
 *   <filesDir>/craft/agent-config.json                { apiKey(encrypted), baseUrl, model, reasoningEffort }
 */
public class CraftStore {

    public static final String DEFAULT_AGENT_BASE_URL = "https://api.deepseek.com/chat/completions";
    public static final String DEFAULT_AGENT_MODEL = "deepseek-flash";

    private static final String REGISTRY_FILE = "gifts.json";
    private static final String WORKSPACE_DIR = "workspace";
    /** Persistent general conversation; deliberately outside the Gift registry and id namespace. */
    private static final String GENERAL_DIR = ".general";
    /** Git internals inside the workspace; never exposed through file traversal. */
    private static final String GIT_DIR = ".git";
    private static final String SNAPSHOTS_DIR = "snapshots";
    private static final String BUILDS_DIR = "builds";
    private static final String DRAFT_POINTER = "draft.json";
    private static final String RELEASE_POINTER = "release.json";
    private static final String AGENT_CONFIG_FILE = "agent-config.json";
    private static final String CONVERSATION_FILE = "conversation.json";
    private static final String CONTEXT_FILE = "context.jsonl";
    private static final String SESSION_FILE = "session.json";
    private static final String ARCHIVE_FILE_PATTERN = "context-archive-\\d+\\.jsonl";
    private static final String META_FILE = "meta.json";
    private static final String BUILD_JS = "app.js";
    private static final String BUILD_CSS = "app.css";

    /** Gift ids are generated slugs; anything else is rejected. */
    private static final String GIFT_ID_PATTERN = "[a-z0-9]+(-[a-z0-9]+)*";
    /** File/dir segments we ever store under a gift dir (uuids, generated file names). */
    private static final String SAFE_SEGMENT_PATTERN = "[A-Za-z0-9][A-Za-z0-9._-]*";

    public static class GiftInfo {
        public final String id;
        public final String name;
        public final String releaseSnapshotId; // nullable
        public final long updatedAt;

        GiftInfo(String id, String name, String releaseSnapshotId, long updatedAt) {
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
        public final GiftInfo gift;
        public final SnapshotInfo snapshot;

        RollbackResult(GiftInfo gift, SnapshotInfo snapshot) {
            this.gift = gift;
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

    // ------------------------------------------------------------------ gifts

    public synchronized List<GiftInfo> listGifts() throws IOException {
        JSONArray gifts = readRegistry().optJSONArray("gifts");
        List<GiftInfo> out = new ArrayList<>();
        if (gifts != null) {
            for (int i = 0; i < gifts.length(); i++) {
                JSONObject entry = gifts.optJSONObject(i);
                if (entry != null) {
                    out.add(giftFromEntry(entry));
                }
            }
        }
        return out;
    }

    /** Returns the registered gift, or throws with a clear message. */
    public synchronized GiftInfo requireGift(String giftId) throws IOException {
        if (giftId == null || !giftId.matches(GIFT_ID_PATTERN)) {
            throw new IllegalArgumentException("Invalid gift id: " + (giftId == null ? "(null)" : giftId));
        }
        JSONArray gifts = readRegistry().optJSONArray("gifts");
        if (gifts != null) {
            for (int i = 0; i < gifts.length(); i++) {
                JSONObject entry = gifts.optJSONObject(i);
                if (entry != null && giftId.equals(entry.optString("id"))) {
                    return giftFromEntry(entry);
                }
            }
        }
        throw new IllegalArgumentException("Unknown gift: " + giftId);
    }

    public synchronized GiftInfo createGift(String name) throws IOException {
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("Gift name is required");
        }
        String trimmed = name.trim();
        JSONObject registry = readRegistry();
        JSONArray gifts = registry.optJSONArray("gifts");
        if (gifts == null) {
            gifts = new JSONArray();
        }
        String slug = slugify(trimmed);
        String giftId;
        do {
            giftId = slug + "-" + UUID.randomUUID().toString().substring(0, 8);
        } while (containsGift(gifts, giftId));

        JSONObject entry = new JSONObject();
        try {
            entry.put("id", giftId);
            entry.put("name", trimmed);
            entry.put("updatedAt", System.currentTimeMillis());
            gifts.put(entry);
            registry.put("gifts", gifts);
        } catch (JSONException e) {
            throw new IOException("Could not build gift registry entry", e);
        }
        atomicWriteString(registryFile(), registry.toString());

        File giftDir = giftDir(giftId);
        File workspace = new File(giftDir, WORKSPACE_DIR);
        //noinspection ResultOfMethodCallIgnored
        workspace.mkdirs();
        try (Git git = Git.init().setDirectory(workspace).call()) {
            // repository initialized; the first commit happens on the first snapshot
        } catch (GitAPIException e) {
            throw new IOException("Could not initialize gift workspace repository", e);
        }
        //noinspection ResultOfMethodCallIgnored
        new File(giftDir, SNAPSHOTS_DIR).mkdirs();
        //noinspection ResultOfMethodCallIgnored
        new File(giftDir, BUILDS_DIR).mkdirs();
        return giftFromEntry(entry);
    }

    /** Sets releaseSnapshotId (or clears it when null) and refreshes updatedAt. */
    private synchronized GiftInfo updateGiftRelease(String giftId, String snapshotId) throws IOException {
        JSONObject registry = readRegistry();
        JSONArray gifts = registry.optJSONArray("gifts");
        if (gifts != null) {
            for (int i = 0; i < gifts.length(); i++) {
                JSONObject entry = gifts.optJSONObject(i);
                if (entry != null && giftId.equals(entry.optString("id"))) {
                    try {
                        if (snapshotId != null) {
                            entry.put("releaseSnapshotId", snapshotId);
                        } else {
                            entry.remove("releaseSnapshotId");
                        }
                        entry.put("updatedAt", System.currentTimeMillis());
                    } catch (JSONException e) {
                        throw new IOException("Could not update gift entry", e);
                    }
                    atomicWriteString(registryFile(), registry.toString());
                    return giftFromEntry(entry);
                }
            }
        }
        throw new IllegalArgumentException("Unknown gift: " + giftId);
    }

    private static GiftInfo giftFromEntry(JSONObject entry) {
        String releaseSnapshotId = entry.has("releaseSnapshotId") && !entry.isNull("releaseSnapshotId")
                ? entry.optString("releaseSnapshotId")
                : null;
        return new GiftInfo(entry.optString("id"), entry.optString("name"), releaseSnapshotId, entry.optLong("updatedAt"));
    }

    private static boolean containsGift(JSONArray gifts, String giftId) {
        for (int i = 0; i < gifts.length(); i++) {
            JSONObject entry = gifts.optJSONObject(i);
            if (entry != null && giftId.equals(entry.optString("id"))) {
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
            throw new IOException("Corrupted gift registry: " + REGISTRY_FILE, e);
        }
    }

    private File registryFile() {
        return new File(rootDir, REGISTRY_FILE);
    }

    // ------------------------------------------------------------ workspace

    /** All workspace files as {relativePath -> content}. Includes app.json if present. */
    public JSONObject workspaceFiles(String giftId) throws IOException, JSONException {
        requireGift(giftId);
        JSONObject files = new JSONObject();
        File workspace = workspaceDir(giftId);
        collectFiles(workspace, "", files);
        return files;
    }

    /** Sorted relative workspace paths. */
    public List<String> listWorkspaceFiles(String giftId) throws IOException {
        requireGift(giftId);
        return listFilesIn(workspaceDir(giftId));
    }

    public String readFile(String giftId, String path) throws IOException {
        requireGift(giftId);
        return readFileIn(workspaceDir(giftId), path);
    }

    /** Atomic write (temp file + rename) of a single workspace file. Path traversal is rejected. */
    public void writeFile(String giftId, String path, String content) throws IOException {
        requireGift(giftId);
        writeFileIn(workspaceDir(giftId), path, content);
    }

    public List<String> listGeneralFiles() throws IOException {
        return listFilesIn(generalWorkspaceDir());
    }

    public String readGeneralFile(String path) throws IOException {
        return readFileIn(generalWorkspaceDir(), path);
    }

    public void writeGeneralFile(String path, String content) throws IOException {
        writeFileIn(generalWorkspaceDir(), path, content);
    }

    private List<String> listFilesIn(File workspace) {
        List<String> out = new ArrayList<>();
        collectPaths(workspace, "", out);
        String[] arr = out.toArray(new String[0]);
        Arrays.sort(arr);
        return Arrays.asList(arr);
    }

    private String readFileIn(File workspace, String path) throws IOException {
        File file = resolveWorkspaceFile(workspace, path);
        if (!file.isFile()) {
            throw new IOException("File not found: " + path);
        }
        return readString(file);
    }

    private void writeFileIn(File workspace, String path, String content) throws IOException {
        atomicWriteString(resolveWorkspaceFile(workspace, path), content == null ? "" : content);
    }

    private File workspaceDir(String giftId) {
        return new File(giftDir(giftId), WORKSPACE_DIR);
    }

    private File generalDir() {
        return new File(rootDir, GENERAL_DIR);
    }

    private File generalWorkspaceDir() {
        return new File(generalDir(), WORKSPACE_DIR);
    }

    /** Opens the git repository embedded in the gift's workspace, initializing it on first use. */
    private Git openWorkspaceGit(String giftId) throws IOException {
        File workspace = workspaceDir(giftId);
        try {
            if (!new File(workspace, GIT_DIR).isDirectory()) {
                // legacy gift created before git versioning: upgrade in place
                return Git.init().setDirectory(workspace).call();
            }
            return Git.open(workspace);
        } catch (GitAPIException | IOException e) {
            throw new IOException("Could not open gift workspace repository: " + giftId, e);
        }
    }

    // ---------------------------------------------------------- conversation

    /** One conversation per gift; stored outside the workspace so it never ships with gift source. */
    public synchronized String readConversation(String giftId) throws IOException {
        requireGift(giftId);
        return readConversationIn(giftDir(giftId));
    }

    public synchronized void writeConversation(String giftId, String json) throws IOException, JSONException {
        requireGift(giftId);
        writeConversationIn(giftDir(giftId), json);
    }

    public synchronized String readGeneralConversation() throws IOException {
        return readConversationIn(generalDir());
    }

    public synchronized void writeGeneralConversation(String json) throws IOException, JSONException {
        writeConversationIn(generalDir(), json);
    }

    private String readConversationIn(File dir) throws IOException {
        File file = new File(dir, CONVERSATION_FILE);
        return file.isFile() ? readString(file) : "[]";
    }

    private void writeConversationIn(File dir, String json) throws IOException, JSONException {
        new JSONArray(json); // reject malformed payloads before they corrupt the saved history
        atomicWriteString(new File(dir, CONVERSATION_FILE), json);
    }

    /** Lossless model transcript; unlike conversation.json this keeps tool calls and reasoning. */
    public synchronized String readModelContext(String giftId) throws IOException {
        requireGift(giftId);
        return readModelContextIn(giftDir(giftId));
    }

    public synchronized void writeModelContext(String giftId, String jsonl) throws IOException {
        requireGift(giftId);
        writeModelContextIn(giftDir(giftId), jsonl);
    }

    public synchronized String readGeneralModelContext() throws IOException {
        return readModelContextIn(generalDir());
    }

    public synchronized void writeGeneralModelContext(String jsonl) throws IOException {
        writeModelContextIn(generalDir(), jsonl);
    }

    private String readModelContextIn(File dir) throws IOException {
        File file = new File(dir, CONTEXT_FILE);
        return file.isFile() ? readString(file) : "";
    }

    private void writeModelContextIn(File dir, String jsonl) throws IOException {
        atomicWriteString(new File(dir, CONTEXT_FILE), jsonl == null ? "" : jsonl);
    }

    /** Each compaction archives the dropped raw messages as a NEW timestamped file. */
    public synchronized String archiveModelContext(String giftId, String jsonl) throws IOException {
        requireGift(giftId);
        return archiveModelContextIn(giftDir(giftId), jsonl);
    }

    public synchronized String archiveGeneralModelContext(String jsonl) throws IOException {
        return archiveModelContextIn(generalDir(), jsonl);
    }

    private String archiveModelContextIn(File dir, String jsonl) throws IOException {
        File file = new File(dir, "context-archive-" + System.currentTimeMillis() + ".jsonl");
        atomicWriteString(file, jsonl == null ? "" : jsonl);
        return file.getName();
    }

    public synchronized List<String> listContextArchives(String giftId) throws IOException {
        requireGift(giftId);
        return listContextArchivesIn(giftDir(giftId));
    }

    public synchronized List<String> listGeneralContextArchives() throws IOException {
        return listContextArchivesIn(generalDir());
    }

    private List<String> listContextArchivesIn(File dir) {
        List<String> out = new ArrayList<>();
        File[] kids = dir.listFiles();
        if (kids != null) {
            for (File kid : kids) {
                if (kid.isFile() && kid.getName().matches(ARCHIVE_FILE_PATTERN)) {
                    out.add(kid.getName());
                }
            }
        }
        out.sort(Comparator.naturalOrder());
        return out;
    }

    public synchronized String readContextArchive(String giftId, String name) throws IOException {
        requireGift(giftId);
        return readContextArchiveIn(giftDir(giftId), name);
    }

    public synchronized String readGeneralContextArchive(String name) throws IOException {
        return readContextArchiveIn(generalDir(), name);
    }

    private String readContextArchiveIn(File dir, String name) throws IOException {
        if (name == null || !name.matches(ARCHIVE_FILE_PATTERN)) {
            throw new IllegalArgumentException("Invalid archive file name");
        }
        File file = new File(dir, name);
        if (!file.isFile()) {
            throw new IOException("Archive not found: " + name);
        }
        return readString(file);
    }

    /** Removes the registry entry and every artifact of the project. */
    public synchronized void deleteGift(String giftId) throws IOException {
        requireGift(giftId);
        JSONObject registry = readRegistry();
        JSONArray gifts = registry.optJSONArray("gifts");
        JSONArray kept = new JSONArray();
        if (gifts != null) {
            for (int i = 0; i < gifts.length(); i++) {
                JSONObject entry = gifts.optJSONObject(i);
                if (entry != null && !giftId.equals(entry.optString("id"))) {
                    kept.put(entry);
                }
            }
        }
        try {
            registry.put("gifts", kept);
        } catch (JSONException e) {
            throw new IOException("Could not update gift registry", e);
        }
        atomicWriteString(registryFile(), registry.toString());
        deleteRecursively(giftDir(giftId));
    }

    public synchronized String readSession() throws IOException {
        File file = new File(rootDir, SESSION_FILE);
        return file.isFile() ? readString(file) : "";
    }

    public synchronized void writeSession(String json) throws IOException, JSONException {
        new JSONObject(json);
        atomicWriteString(new File(rootDir, SESSION_FILE), json);
    }

    private File giftDir(String giftId) {
        return new File(rootDir, giftId);
    }

    private File resolveWorkspaceFile(File workspace, String relPath) throws IOException {
        if (relPath == null || relPath.trim().isEmpty()) {
            throw new IllegalArgumentException("Path must not be empty");
        }
        if (relPath.indexOf('\u0000') >= 0) {
            throw new IllegalArgumentException("Invalid path: " + relPath);
        }
        if (relPath.startsWith("/") || relPath.indexOf('\\') >= 0) {
            throw new IllegalArgumentException("Invalid path: " + relPath);
        }
        File target = new File(workspace, relPath);
        String canonical = target.getCanonicalPath();
        String base = workspace.getCanonicalPath() + File.separator;
        if (!canonical.equals(workspace.getCanonicalPath()) && !canonical.startsWith(base)) {
            throw new IllegalArgumentException("Path escapes the selected workspace: " + relPath);
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
            if (GIT_DIR.equals(kid.getName())) {
                continue; // never expose git internals to agent tooling
            }
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
            if (GIT_DIR.equals(kid.getName())) {
                continue; // never expose git internals to agent tooling
            }
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

    /**
     * Commits the current workspace state as a snapshot. buildId attaches a stored build
     * to this snapshot.
     */
    public SnapshotInfo createSnapshot(String giftId, String message, String buildId) throws IOException, JSONException {
        requireGift(giftId);
        String commitMessage = message == null ? "" : message;
        String snapshotId;
        long createdAt;
        try (Git git = openWorkspaceGit(giftId)) {
            git.add().addFilepattern(".").call();
            git.add().setUpdate(true).addFilepattern(".").call(); // also stage deletions
            PersonIdent ident = new PersonIdent("Craft", "craft@localhost");
            RevCommit commit = git.commit()
                    .setMessage(commitMessage)
                    .setAuthor(ident)
                    .setCommitter(ident)
                    .setAllowEmpty(true) // snapshot an unchanged workspace too
                    .call();
            snapshotId = commit.getName();
            createdAt = commit.getCommitTime() * 1000L;
        } catch (GitAPIException e) {
            throw new IOException("Could not create snapshot", e);
        }

        JSONObject meta = new JSONObject();
        meta.put("id", snapshotId);
        meta.put("message", commitMessage);
        meta.put("createdAt", createdAt);
        if (buildId != null) {
            meta.put("buildId", buildId);
        }
        atomicWriteString(metaFile(giftId, snapshotId), meta.toString());
        return snapshotFromMeta(meta);
    }

    /** Snapshots (commits), newest first. */
    public List<SnapshotInfo> listSnapshots(String giftId) throws IOException, JSONException {
        requireGift(giftId);
        List<SnapshotInfo> out = new ArrayList<>();
        try (Git git = openWorkspaceGit(giftId)) {
            for (RevCommit commit : git.log().call()) {
                out.add(snapshotFromCommit(giftId, commit));
            }
        } catch (NoHeadException e) {
            // no commits yet: an empty history is a valid result
        } catch (GitAPIException e) {
            throw new IOException("Could not list snapshots", e);
        }
        return out;
    }

    public JSONObject readSnapshotMeta(String giftId, String snapshotId) throws IOException, JSONException {
        checkSegment(snapshotId, "snapshot id");
        File metaFile = metaFile(giftId, snapshotId);
        if (!metaFile.isFile()) {
            throw new IllegalArgumentException("Unknown snapshot: " + snapshotId);
        }
        return new JSONObject(readString(metaFile));
    }

    private static SnapshotInfo snapshotFromMeta(JSONObject meta) {
        String buildId = meta.has("buildId") && !meta.isNull("buildId") ? meta.optString("buildId") : null;
        return new SnapshotInfo(meta.optString("id"), meta.optString("message"), meta.optLong("createdAt"), buildId);
    }

    /** Snapshot info from a commit; buildId comes from the snapshot's meta.json when present. */
    private SnapshotInfo snapshotFromCommit(String giftId, RevCommit commit) throws IOException, JSONException {
        String buildId = null;
        File meta = metaFile(giftId, commit.getName());
        if (meta.isFile()) {
            buildId = snapshotFromMeta(new JSONObject(readString(meta))).buildId;
        }
        return new SnapshotInfo(commit.getName(), commit.getFullMessage(), commit.getCommitTime() * 1000L, buildId);
    }

    private File snapshotsDir(String giftId) {
        return new File(giftDir(giftId), SNAPSHOTS_DIR);
    }

    private File metaFile(String giftId, String snapshotId) {
        return new File(new File(snapshotsDir(giftId), snapshotId), META_FILE);
    }

    // --------------------------------------------------------------- builds

    /**
     * Stores an immutable build under builds/<buildId>. When {@code draft} is true the draft
     * pointer is updated. When {@code snapshotId} is given, the build id is attached to that
     * snapshot's metadata.
     */
    public String saveBuild(String giftId, String snapshotId, String js, String css, boolean draft)
            throws IOException, JSONException {
        requireGift(giftId);
        String buildId = UUID.randomUUID().toString();
        File buildDir = new File(buildsDir(giftId), buildId);
        if (!buildDir.exists() && !buildDir.mkdirs()) {
            throw new IOException("Could not create build directory");
        }
        atomicWriteString(new File(buildDir, BUILD_JS), js == null ? "" : js);
        atomicWriteString(new File(buildDir, BUILD_CSS), css == null ? "" : css);

        if (draft) {
            JSONObject pointer = new JSONObject();
            pointer.put("buildId", buildId);
            atomicWriteString(new File(giftDir(giftId), DRAFT_POINTER), pointer.toString());
        }
        if (snapshotId != null && !snapshotId.isEmpty()) {
            JSONObject meta = readSnapshotMeta(giftId, snapshotId);
            meta.put("buildId", buildId);
            atomicWriteString(metaFile(giftId, snapshotId), meta.toString());
        }
        return buildId;
    }

    public Build getBuild(String giftId, String buildId) throws IOException {
        requireGift(giftId);
        checkSegment(buildId, "build id");
        File buildDir = new File(buildsDir(giftId), buildId);
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
    public Build getBuildFor(String giftId, String environment) throws IOException, JSONException {
        requireGift(giftId);
        String env = environment == null ? "" : environment;
        if (!"draft".equals(env) && !"release".equals(env)) {
            throw new IllegalArgumentException("Unknown environment: " + env);
        }
        String buildId = pointerBuildId(giftId, env);
        if (buildId == null) {
            if ("draft".equals(env)) {
                throw new IllegalStateException("No draft build available for gift " + giftId
                        + ". Save a build with draft:true first.");
            }
            throw new IllegalStateException("No release build available for gift " + giftId
                    + ". Publish a snapshot first.");
        }
        return getBuild(giftId, buildId);
    }

    private String pointerBuildId(String giftId, String environment) throws IOException {
        File pointer = new File(giftDir(giftId), "draft".equals(environment) ? DRAFT_POINTER : RELEASE_POINTER);
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
    public GiftInfo publish(String giftId, String snapshotId) throws IOException, JSONException {
        requireGift(giftId);
        JSONObject meta = readSnapshotMeta(giftId, snapshotId);
        String buildId = meta.has("buildId") && !meta.isNull("buildId") ? meta.optString("buildId") : null;
        if (buildId == null || buildId.isEmpty()) {
            throw new IllegalStateException("Snapshot " + snapshotId
                    + " has no stored build. Save a build with this snapshotId before publishing.");
        }
        JSONObject pointer = new JSONObject();
        pointer.put("buildId", buildId);
        atomicWriteString(new File(giftDir(giftId), RELEASE_POINTER), pointer.toString());
        return updateGiftRelease(giftId, snapshotId);
    }

    /**
     * Restores the target snapshot's files into the workspace via checkout + clean
     * (history stays linear; no hard reset), then creates a new snapshot
     * ("Rollback to <id>") associated with the target build and makes it the release.
     */
    public RollbackResult rollback(String giftId, String snapshotId) throws IOException, JSONException {
        requireGift(giftId);
        JSONObject targetMeta = readSnapshotMeta(giftId, snapshotId);
        String targetBuildId = targetMeta.has("buildId") && !targetMeta.isNull("buildId")
                ? targetMeta.optString("buildId")
                : null;

        try (Git git = openWorkspaceGit(giftId)) {
            git.checkout().setStartPoint(snapshotId).addPath(".").call();
            git.clean().setCleanDirectories(true).call(); // drop files created after the target
        } catch (IOException | GitAPIException e) {
            throw new IOException("Could not restore snapshot " + snapshotId, e);
        }

        SnapshotInfo snapshot = createSnapshot(giftId, "Rollback to " + snapshotId, targetBuildId);
        if (targetBuildId != null) {
            JSONObject pointer = new JSONObject();
            pointer.put("buildId", targetBuildId);
            atomicWriteString(new File(giftDir(giftId), RELEASE_POINTER), pointer.toString());
        }
        GiftInfo gift = updateGiftRelease(giftId, snapshot.id);
        return new RollbackResult(gift, snapshot);
    }

    private File buildsDir(String giftId) {
        return new File(giftDir(giftId), BUILDS_DIR);
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
