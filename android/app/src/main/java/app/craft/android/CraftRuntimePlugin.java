package app.craft.android;

import android.app.Activity;
import android.content.Intent;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/**
 * Runtime bridge for the native preview. Dispatches to the PreviewActivity's WebView on
 * the main thread and resolves plugin calls asynchronously from the JS result.
 */
@CapacitorPlugin(name = "CraftRuntime")
public class CraftRuntimePlugin extends Plugin {

    private static final String ENV_DRAFT = "draft";
    private static final String ENV_RELEASE = "release";

    // Semantic summary of the visible DOM: testid, role, labels, text, input types.
    private static final String INSPECT_JS = "(function(){"
            + "var SKIP={SCRIPT:1,STYLE:1,HEAD:1,META:1,LINK:1,TITLE:1,NOSCRIPT:1,TEMPLATE:1};"
            + "function vis(el){"
            + "if(el===document.body)return true;"
            + "var cs=window.getComputedStyle(el);"
            + "if(!cs||cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0')return false;"
            + "var r=el.getBoundingClientRect();"
            + "return !(r.width===0&&r.height===0);"
            + "}"
            + "function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\\"/g,'&quot;');}"
            + "function squash(s){return String(s).replace(/\\s+/g,' ').trim();}"
            + "function ownText(el){"
            + "var t='';var n=el.firstChild;"
            + "while(n){if(n.nodeType===3){var s=squash(n.textContent);if(s)t+=(t?' ':'')+s;}n=n.nextSibling;}"
            + "return t.slice(0,160);"
            + "}"
            + "function attrs(el){"
            + "var a='';var tag=el.tagName.toLowerCase();"
            + "var tid=el.getAttribute('data-testid');if(tid)a+=' data-testid=\"'+esc(tid)+'\"';"
            + "var role=el.getAttribute('role');if(role)a+=' role=\"'+esc(role)+'\"';"
            + "if(tag==='input')a+=' type=\"'+esc(el.getAttribute('type')||'text')+'\"';"
            + "if(tag==='textarea')a+=' type=\"textarea\"';"
            + "if(tag==='select')a+=' type=\"select\"';"
            + "var label=el.getAttribute('aria-label');"
            + "if(!label&&(tag==='input'||tag==='textarea')){"
            + "if(el.labels&&el.labels.length&&el.labels[0].textContent)label=el.labels[0].textContent;"
            + "else label=el.getAttribute('placeholder');"
            + "}"
            + "if(label)label=squash(label).slice(0,80);"
            + "if(label)a+=' label=\"'+esc(label)+'\"';"
            + "if((tag==='input'||tag==='textarea')&&el.value)a+=' value=\"'+esc(String(el.value).slice(0,80))+'\"';"
            + "if(tag==='a'&&el.getAttribute('href'))a+=' href=\"'+esc(el.getAttribute('href'))+'\"';"
            + "return a;"
            + "}"
            + "var out=[];var MAX=400;"
            + "function pad(d){var s='';for(var i=0;i<d;i++)s+='  ';return s;}"
            + "function walk(el,depth){"
            + "if(out.length>=MAX)return;"
            + "if(!el||el.nodeType!==1||SKIP[el.tagName]||!vis(el))return;"
            + "var tag=el.tagName.toLowerCase();"
            + "var open='<'+tag+attrs(el)+'>';"
            + "var kids=[];"
            + "if(tag!=='input'&&tag!=='textarea'){"
            + "var c=el.children;"
            + "for(var i=0;i<c.length;i++){if(!SKIP[c[i].tagName]&&vis(c[i]))kids.push(c[i]);}"
            + "}"
            + "var text=ownText(el);"
            + "if(kids.length===0){"
            + "out.push(pad(depth)+open+(text?esc(text):'')+'</'+tag+'>');"
            + "}else{"
            + "out.push(pad(depth)+open+(text?esc(text):''));"
            + "for(var j=0;j<kids.length&&out.length<MAX;j++)walk(kids[j],depth+1);"
            + "if(out.length<MAX)out.push(pad(depth)+'</'+tag+'>');"
            + "}"
            + "}"
            + "if(document.body)walk(document.body,0);"
            + "if(out.length>=MAX)out.push('...(truncated)');"
            + "return {tree:out.join('\\n'),title:document.title||'',url:location.href};"
            + "})()";

    // Click a visible element by data-testid first, then visible text, then coordinates.
    // Body is wrapped by scriptWithArgs() which injects the args object.
    private static final String CLICK_BODY =
            "function vis(el){"
            + "if(!el||el.nodeType!==1)return false;"
            + "var cs=window.getComputedStyle(el);"
            + "if(!cs||cs.display==='none'||cs.visibility==='hidden')return false;"
            + "var r=el.getBoundingClientRect();"
            + "return !(r.width===0&&r.height===0);"
            + "}"
            + "function squash(s){return String(s).replace(/\\s+/g,' ').trim().toLowerCase();}"
            + "function findByTestId(){"
            + "var all=document.querySelectorAll('[data-testid]');var i,el;"
            + "for(i=0;i<all.length;i++){el=all[i];if(el.getAttribute('data-testid')===args.testId&&vis(el))return el;}"
            + "for(i=0;i<all.length;i++){el=all[i];if(el.getAttribute('data-testid')===args.testId)return el;}"
            + "return null;"
            + "}"
            + "function findByText(){"
            + "var want=squash(args.text);"
            + "if(!want)return null;"
            + "var cands=document.querySelectorAll('button,a,summary,label,[role=\"button\"],[role=\"link\"],[role=\"tab\"],[role=\"menuitem\"],input[type=\"button\"],input[type=\"submit\"],[onclick],[data-testid]');"
            + "var best=null,i,el,t;"
            + "for(i=0;i<cands.length;i++){"
            + "el=cands[i];"
            + "if(!vis(el))continue;"
            + "t=squash(el.innerText||el.textContent||el.value||'');"
            + "if(!t)continue;"
            + "if(t===want)return el;"
            + "if(!best&&t.indexOf(want)!==-1)best=el;"
            + "}"
            + "if(best)return best;"
            + "var all=document.querySelectorAll('body *');"
            + "for(i=0;i<all.length;i++){"
            + "el=all[i];"
            + "if(!vis(el))continue;"
            + "t=squash(el.textContent||'');"
            + "if(t===want)return el;"
            + "}"
            + "return null;"
            + "}"
            + "function find(){"
            + "var el=null;"
            + "if(args.testId!=null&&args.testId!=='')el=findByTestId();"
            + "if(!el&&args.text!=null&&args.text!=='')el=findByText();"
            + "if(!el&&args.x!=null&&args.y!=null)el=document.elementFromPoint(args.x,args.y);"
            + "return el;"
            + "}"
            + "var el=find();"
            + "if(!el){"
            + "var what='';"
            + "if(args.testId!=null)what+=' testId \"'+args.testId+'\"';"
            + "if(args.text!=null)what+=' text \"'+args.text+'\"';"
            + "if(args.x!=null&&args.y!=null)what+=' at ('+args.x+','+args.y+')';"
            + "return {ok:false,error:'No clickable element found for'+what};"
            + "}"
            + "var r=el.getBoundingClientRect();"
            + "var opts={bubbles:true,cancelable:true,view:window,clientX:r.left+r.width/2,clientY:r.top+r.height/2};"
            + "try{el.dispatchEvent(new MouseEvent('mousedown',opts));}catch(e){}"
            + "try{el.dispatchEvent(new MouseEvent('mouseup',opts));}catch(e){}"
            + "try{el.focus();}catch(e){}"
            + "el.click();"
            + "return {ok:true};";

    // Set an editable element's value (React-safe via the native value setter) and
    // dispatch input + change. Body is wrapped by scriptWithArgs().
    private static final String INPUT_BODY =
            "var value=args.value==null?'':String(args.value);"
            + "function findByTestId(){"
            + "var all=document.querySelectorAll('[data-testid]');"
            + "for(var i=0;i<all.length;i++){if(all[i].getAttribute('data-testid')===args.testId)return all[i];}"
            + "return null;"
            + "}"
            + "function squash(s){return String(s).replace(/\\s+/g,' ').trim().toLowerCase();}"
            + "function findByLabel(){"
            + "var want=squash(args.label);"
            + "if(!want)return null;"
            + "var labels=document.querySelectorAll('label');"
            + "for(var i=0;i<labels.length;i++){"
            + "var t=squash(labels[i].textContent||'');"
            + "if(t===want||t.indexOf(want)!==-1){"
            + "var c=labels[i].control;"
            + "if(!c){var fid=labels[i].getAttribute('for');if(fid)c=document.getElementById(fid);}"
            + "if(!c){var inner=labels[i].querySelector('input,textarea,select');if(inner)c=inner;}"
            + "if(c)return c;"
            + "}"
            + "}"
            + "var fields=document.querySelectorAll('input,textarea,select');"
            + "for(var j=0;j<fields.length;j++){"
            + "var f=fields[j];"
            + "var al=f.getAttribute('aria-label')||f.getAttribute('placeholder')||f.getAttribute('name')||'';"
            + "if(al&&squash(al).indexOf(want)!==-1)return f;"
            + "}"
            + "return null;"
            + "}"
            + "var el=(args.testId!=null&&args.testId!=='')?findByTestId():null;"
            + "if(!el&&args.label!=null&&args.label!=='')el=findByLabel();"
            + "if(!el){"
            + "var what='';"
            + "if(args.testId!=null)what+=' testId \"'+args.testId+'\"';"
            + "if(args.label!=null)what+=' label \"'+args.label+'\"';"
            + "return {ok:false,error:'No editable element found for'+what};"
            + "}"
            + "var tag=el.tagName;"
            + "if(tag==='SELECT'){"
            + "var matched=false;"
            + "for(var k=0;k<el.options.length;k++){"
            + "var o=el.options[k];"
            + "if(String(o.value)===value||squash(o.text)===squash(value)){el.value=o.value;matched=true;break;}"
            + "}"
            + "if(!matched)el.value=value;"
            + "}else if(tag==='INPUT'||tag==='TEXTAREA'){"
            + "var proto=tag==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;"
            + "var desc=Object.getOwnPropertyDescriptor(proto,'value');"
            + "if(desc&&desc.set)desc.set.call(el,value);else el.value=value;"
            + "el.dispatchEvent(new Event('input',{bubbles:true}));"
            + "}else if(el.isContentEditable){"
            + "el.textContent=value;"
            + "el.dispatchEvent(new Event('input',{bubbles:true}));"
            + "}else{"
            + "return {ok:false,error:'Element is not editable ('+tag.toLowerCase()+')'};"
            + "}"
            + "el.dispatchEvent(new Event('change',{bubbles:true}));"
            + "return {ok:true};";

    @Override
    public void load() {
        // no state; each call dispatches to the current PreviewActivity
    }

    // ---------------------------------------------------------------- preview

    @PluginMethod
    public void openDraft(PluginCall call) {
        openPreview(call, ENV_DRAFT);
    }

    @PluginMethod
    public void openRelease(PluginCall call) {
        openPreview(call, ENV_RELEASE);
    }

    private void openPreview(PluginCall call, String environment) {
        String appId = call.getString("appId");
        if (appId == null || appId.isEmpty()) {
            call.reject("appId is required");
            return;
        }
        // Fail early with a clear message when the requested build does not exist.
        CraftStore store = new CraftStore(getContext());
        try {
            store.requireApp(appId);
            store.getBuildFor(appId, environment);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
            return;
        }
        String title = call.getString("title");
        if (title == null || title.trim().isEmpty()) {
            title = "Craft Preview";
        }
        Intent intent = new Intent(getContext(), PreviewActivity.class);
        intent.putExtra(PreviewActivity.EXTRA_APP_ID, appId);
        intent.putExtra(PreviewActivity.EXTRA_ENVIRONMENT, environment);
        intent.putExtra(PreviewActivity.EXTRA_TITLE, title.trim());

        Activity activity = getActivity();
        if (activity != null && !activity.isFinishing()) {
            activity.startActivity(intent);
        } else {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void closePreview(PluginCall call) {
        final PreviewActivity preview = PreviewActivity.peek();
        if (preview != null && !preview.isFinishing()) {
            preview.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    preview.finish();
                }
            });
        }
        call.resolve(new JSObject().put("ok", true));
    }

    // ------------------------------------------------------------------ probe

    @PluginMethod
    public void screenshot(PluginCall call) {
        final PreviewActivity preview = requirePreview(call);
        if (preview == null) {
            return;
        }
        preview.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                preview.captureScreenshot(new PreviewActivity.StringCallback() {
                    @Override
                    public void onResult(String dataUrl) {
                        if (dataUrl == null) {
                            call.reject("Could not capture screenshot: preview view has no size yet");
                        } else {
                            call.resolve(new JSObject().put("dataUrl", dataUrl));
                        }
                    }
                });
            }
        });
    }

    @PluginMethod
    public void inspect(PluginCall call) {
        final PreviewActivity preview = requirePreview(call);
        if (preview == null) {
            return;
        }
        preview.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                preview.evaluateJs(INSPECT_JS, new PreviewActivity.StringCallback() {
                    @Override
                    public void onResult(String value) {
                        try {
                            if (value == null || "null".equals(value)) {
                                call.reject("Inspect failed: preview returned no result");
                                return;
                            }
                            JSONObject result = new JSONObject(value);
                            JSObject ret = new JSObject();
                            ret.put("tree", result.optString("tree", ""));
                            ret.put("title", result.optString("title", ""));
                            ret.put("url", result.optString("url", ""));
                            call.resolve(ret);
                        } catch (Exception e) {
                            call.reject("Inspect failed: " + e.getMessage(), e);
                        }
                    }
                });
            }
        });
    }

    @PluginMethod
    public void click(PluginCall call) {
        String testId = call.getString("testId");
        String text = call.getString("text");
        Double x = call.getDouble("x");
        Double y = call.getDouble("y");
        if ((testId == null || testId.isEmpty()) && (text == null || text.isEmpty()) && (x == null || y == null)) {
            call.reject("Provide testId, text, or both x and y coordinates");
            return;
        }
        JSONObject args = new JSONObject();
        try {
            if (testId != null && !testId.isEmpty()) args.put("testId", testId);
            if (text != null && !text.isEmpty()) args.put("text", text);
            if (x != null && y != null) {
                args.put("x", x);
                args.put("y", y);
            }
        } catch (Exception e) {
            call.reject("Could not build click args: " + e.getMessage(), e);
            return;
        }
        dispatchAction(call, scriptWithArgs(CLICK_BODY, args));
    }

    @PluginMethod
    public void input(PluginCall call) {
        String testId = call.getString("testId");
        String label = call.getString("label");
        String value = call.getString("value");
        if (value == null) {
            call.reject("value is required");
            return;
        }
        if ((testId == null || testId.isEmpty()) && (label == null || label.isEmpty())) {
            call.reject("Provide testId or label");
            return;
        }
        JSONObject args = new JSONObject();
        try {
            if (testId != null && !testId.isEmpty()) args.put("testId", testId);
            if (label != null && !label.isEmpty()) args.put("label", label);
            args.put("value", value);
        } catch (Exception e) {
            call.reject("Could not build input args: " + e.getMessage(), e);
            return;
        }
        dispatchAction(call, scriptWithArgs(INPUT_BODY, args));
    }

    @PluginMethod
    public void logs(PluginCall call) {
        final PreviewActivity preview = requirePreview(call);
        if (preview == null) {
            return;
        }
        JSArray arr = new JSArray();
        for (String line : preview.getLogsSnapshot()) {
            arr.put(line);
        }
        call.resolve(new JSObject().put("logs", arr));
    }

    // -------------------------------------------------------------- helpers

    private PreviewActivity requirePreview(PluginCall call) {
        PreviewActivity preview = PreviewActivity.peek();
        if (preview == null || preview.isFinishing()) {
            call.reject("No preview is currently open. Call CraftRuntime.openDraft or openRelease first.");
            return null;
        }
        return preview;
    }

    /** Runs an ok/error JS action script on the UI thread and resolves/rejects the call. */
    private void dispatchAction(final PluginCall call, final String script) {
        final PreviewActivity preview = requirePreview(call);
        if (preview == null) {
            return;
        }
        preview.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                preview.evaluateJs(script, new PreviewActivity.StringCallback() {
                    @Override
                    public void onResult(String value) {
                        try {
                            if (value == null || "null".equals(value)) {
                                call.reject("Preview action failed: no result");
                                return;
                            }
                            JSONObject result = new JSONObject(value);
                            if (result.optBoolean("ok", false)) {
                                call.resolve(new JSObject().put("ok", true));
                            } else {
                                call.reject(result.optString("error", "Preview action failed"));
                            }
                        } catch (Exception e) {
                            call.reject("Preview action failed: " + e.getMessage(), e);
                        }
                    }
                });
            }
        });
    }

    /** Wraps an action body so it can read the serialized args object. */
    private static String scriptWithArgs(String body, JSONObject args) {
        return "(function(){var args=" + args.toString() + ";" + body + "})()";
    }
}
