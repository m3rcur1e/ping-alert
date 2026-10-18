const cur1e = require("cur1e-shared");

const SOUND_PREF = "pingalert-sound", CHAT_PREF = "pingalert-chat", ARROW_PREF = "pingalert-arrow", CARDS_PREF = "pingalert-show-cards";
function on(pref){ return Core.settings.getBool(pref, true); }

const DURATION = 20;
const EDGE = 40;

const arrows = {};

function head(x, y, angle, size){
    Fill.tri(
        x + Angles.trnsx(angle, size), y + Angles.trnsy(angle, size),
        x + Angles.trnsx(angle + 140, size), y + Angles.trnsy(angle + 140, size),
        x + Angles.trnsx(angle - 140, size), y + Angles.trnsy(angle - 140, size));
}

const HUD_LOOKUP_MS = 500;
let hudEls = [], hudLookAt = -HUD_LOOKUP_MS;
const hudRects = [];

function collectHud(group, depth, out){
    const sw = Core.scene.getWidth(), sh = Core.scene.getHeight();
    group.getChildren().each(e => {
        const full = e.getWidth() >= sw - 1 && e.getHeight() >= sh - 1;
        if(e instanceof Group && (full || e instanceof Stack)){
            if(depth < 4) collectHud(e, depth + 1, out);
        }else{
            out.push(e);
        }
    });
}

function shown(e){
    for(let p = e; p != null; p = p.parent){
        if(!p.visible || p.color.a < 0.05) return false;
    }
    return true;
}

function pushRect(e){
    if(e == null || !shown(e) || e.getWidth() <= 0 || e.getHeight() <= 0) return;
    const v = e.localToStageCoordinates(Tmp.v1.set(0, 0));
    hudRects.push(v.x, v.y, e.getWidth(), e.getHeight());
}

function updateHudRects(){
    if(Time.timeSinceMillis(hudLookAt) > HUD_LOOKUP_MS){
        hudLookAt = Time.millis();
        hudEls = [];
        collectHud(Vars.ui.hudGroup, 0, hudEls);
    }
    hudRects.length = 0;
    for(let i = 0; i < hudEls.length; i++) pushRect(hudEls[i]);
    pushRect(rateCalc());
    if(cardsRoot != null && cardsRoot.parent != null) pushRect(cardsRoot);
}

function rayToHud(cx, cy, dx, dy, m, max){
    let best = max;
    for(let i = 0; i < hudRects.length; i += 4){
        let x1 = hudRects[i] - m, y1 = hudRects[i + 1] - m, x2 = hudRects[i] + hudRects[i + 2] + m, y2 = hudRects[i + 1] + hudRects[i + 3] + m;
        let tin = -1e9, tout = 1e9;
        if(dx != 0){
            let a = (x1 - cx) / dx, b = (x2 - cx) / dx;
            tin = a < b ? a : b; tout = a < b ? b : a;
        }else if(cx < x1 || cx > x2) continue;
        if(dy != 0){
            let a = (y1 - cy) / dy, b = (y2 - cy) / dy;
            let lo = a < b ? a : b, hi = a < b ? b : a;
            if(lo > tin) tin = lo;
            if(hi < tout) tout = hi;
        }else if(cy < y1 || cy > y2) continue;
        if(tin < tout && tin > 0 && tin < best) best = tin;
    }
    return best;
}

function labelOffHud(lab, hw, hh, pad, w, h){
    for(let iter = 0; iter < 3; iter++){
        let moved = false;
        for(let i = 0; i < hudRects.length; i += 4){
            let x1 = hudRects[i] - pad, y1 = hudRects[i + 1] - pad, x2 = hudRects[i] + hudRects[i + 2] + pad, y2 = hudRects[i + 1] + hudRects[i + 3] + pad;
            if(lab[0] + hw <= x1 || lab[0] - hw >= x2 || lab[1] + hh <= y1 || lab[1] - hh >= y2) continue;
            let moves = [x1 - hw - lab[0], 0, x2 + hw - lab[0], 0, 0, y1 - hh - lab[1], 0, y2 + hh - lab[1]];
            let bx = 0, by = 0, bd = 1e9;
            for(let k = 0; k < 8; k += 2){
                let nx = lab[0] + moves[k], ny = lab[1] + moves[k + 1];
                if(nx - hw < 0 || nx + hw > w || ny - hh < 0 || ny + hh > h) continue;
                let d = Math.abs(moves[k]) + Math.abs(moves[k + 1]);
                if(d < bd){ bd = d; bx = moves[k]; by = moves[k + 1]; }
            }
            if(bd < 1e9){
                lab[0] += bx;
                lab[1] += by;
                moved = true;
            }
        }
        if(!moved) break;
    }
}

function showArrow(source, wx, wy){
    const id = prop(source, "id");
    if(arrows[id]) arrows[id].remove();

    const color = new Color(prop(source, "color"));
    const name = Strings.stripColors(prop(source, "name"));
    const start = Time.millis();
    const pos = new Vec2();
    const layout = new GlyphLayout();
    const lab = [0, 0];
    let dist = -1, label = "";

    const el = extend(Element, {
        draw(){
            Core.camera.project(pos.set(wx, wy));
            const w = Core.graphics.getWidth(), h = Core.graphics.getHeight();

            if(pos.x >= 0 && pos.x <= w && pos.y >= 0 && pos.y <= h) return;

            const left = 1 - (Time.millis() - start) / (DURATION * 1000);
            if(left <= 0) return;
            const alpha = Math.min(1, left * 5);

            const cx = w / 2, cy = h / 2;
            const dx = pos.x - cx, dy = pos.y - cy;
            const margin = Scl.scl(EDGE);
            const size = Scl.scl(14);
            const outer = size * 1.35;
            updateHudRects();
            const k = rayToHud(cx, cy, dx, dy, outer + Scl.scl(6),
                Math.min((cx - margin) / Math.max(Math.abs(dx), 0.001), (cy - margin) / Math.max(Math.abs(dy), 0.001)));
            const ax = cx + dx * k, ay = cy + dy * k;
            const angle = Angles.angle(cx, cy, pos.x, pos.y);

            const font = Fonts.outline;
            const d = Math.round(Mathf.dst(Vars.player.x, Vars.player.y, wx, wy) / Vars.tilesize);
            if(d != dist){
                dist = d;
                label = name + " " + d;
                layout.setText(font, label);
            }

            const pad = Scl.scl(6), lp = Scl.scl(3), capH = font.getCapHeight();
            const hw = layout.width / 2 + lp, hh = capH / 2 + lp + Scl.scl(2);
            const len = Math.max(Mathf.len(dx, dy), 0.001), ux = dx / len, uy = dy / len;
            const gap = outer + Scl.scl(3);
            const s = Math.min((hw + gap) / Math.max(Math.abs(ux), 0.001), (hh + gap) / Math.max(Math.abs(uy), 0.001));
            lab[0] = ax - ux * s;
            lab[1] = ay - uy * s;
            labelOffHud(lab, hw, hh, Scl.scl(4), w, h);
            const tx = Mathf.clamp(lab[0], pad + hw, w - pad - hw);
            const ty = Mathf.clamp(lab[1], pad + hh, h - pad - hh);

            Draw.color(Color.black);
            Draw.alpha(alpha * 0.6);
            head(ax, ay, angle, outer);
            Draw.color(color);
            Draw.alpha(alpha);
            head(ax, ay, angle, size);

            font.setColor(color.r, color.g, color.b, alpha);
            font.draw(label, tx, ty + capH / 2, Align.center);
            font.setColor(Color.white);
            Draw.reset();
        }
    });
    el.touchable = Touchable.disabled;
    el.setFillParent(true);
    el.visibility = boolp(() => Vars.ui.hudfrag.shown);
    el.actions(Actions.delay(DURATION), Actions.run(() => { if(arrows[id] === el) delete arrows[id]; }), Actions.remove());
    Core.scene.add(el);
    arrows[id] = el;
}

const PREVIEW_SIZE_DEFAULT = 120;
const MAX_CARDS_DEFAULT = 2;
function previewSize(){ return Core.settings.getInt("pingalert-preview", PREVIEW_SIZE_DEFAULT); }
function maxCards(){ return Core.settings.getInt("pingalert-cards", MAX_CARDS_DEFAULT); }
const SUPERSAMPLE = 2;
const CARD_SECONDS = 8;

const cards = [];
let cardsRoot = null;

function goTo(x, y){
    Vars.control.input.panCamera(new Vec2(x, y));
}

function previewScale(){
    return Math.max(1, Math.round(Scl.scl(previewSize()) / previewSize()));
}

const TOP = 130;
const BOTTOM_KEEP = 60;

const RATE_LOOKUP_MS = 250;
let ratePanel = null, rateLookAt = 0;
function rateCalc(){
    if(ratePanel != null && ratePanel.getScene() == null) ratePanel = null;
    if(ratePanel == null && Time.timeSinceMillis(rateLookAt) > RATE_LOOKUP_MS){
        rateLookAt = Time.millis();
        ratePanel = Core.scene.find("rate-calculator-panel");
    }
    return ratePanel != null && ratePanel.visible ? ratePanel : null;
}

function cardsTop(){
    const rate = rateCalc();
    if(rate != null){
        const bottom = rate.localToStageCoordinates(Tmp.v1.set(0, 0)).y;
        return Core.scene.getHeight() - bottom + Scl.scl(6);
    }
    return Scl.scl(Scl.scl(TOP));
}

let lastTop = -1;

function layoutCards(){
    const top = cardsTop();
    lastTop = top;
    cardsRoot.clearChildren();

    const cardH = cards[0].table.getPrefHeight() + Scl.scl(4);
    const perColumn = Math.max(1, Math.floor((Core.scene.getHeight() - top - Scl.scl(BOTTOM_KEEP)) / cardH));
    let column = null;
    cards.forEach((c, i) => {
        if(i % perColumn == 0){
            column = new Table();
            cardsRoot.add(column).top().left().padRight(Scl.scl(4));
        }
        column.add(c.table).left().padBottom(Scl.scl(4));
        column.row();
    });
    place();
}

let leftX = -1;
function cardsLeft(){
    const rate = rateCalc();
    if(rate != null) leftX = rate.localToStageCoordinates(Tmp.v1.set(0, 0)).x;
    return leftX >= 0 ? leftX : Scl.scl(Scl.scl(8));
}

function place(){
    cardsRoot.pack();
    cardsRoot.setPosition(cardsLeft(), Core.scene.getHeight() - lastTop - cardsRoot.getHeight());
}

function rebuildCards(){
    if(cards.length == 0){
        if(cardsRoot != null) cardsRoot.remove();
        cardsRoot = null;
        return;
    }
    if(cardsRoot == null || cardsRoot.parent == null){
        cardsRoot = new Table();
        cardsRoot.touchable = Touchable.childrenOnly;
        cardsRoot.top().left();
        cardsRoot.visibility = boolp(() => Vars.ui.hudfrag.shown);
        cardsRoot.update(() => {
            if(Math.abs(cardsTop() - lastTop) > 0.5) layoutCards();
            else place();
        });
        Core.scene.add(cardsRoot);
    }
    layoutCards();
}

function removeCard(c){
    const i = cards.indexOf(c);
    if(i == -1) return;
    cards.splice(i, 1);
    c.table.remove();
    c.fbo.dispose();
    rebuildCards();
}

function renderPreview(c){
    const cam = Core.camera, r = Vars.renderer;
    const w = cam.width, h = cam.height, px = cam.position.x, py = cam.position.y;
    const weather = r.drawWeather, pings = r.showPings;
    let begun = false;
    try{
        r.drawWeather = false;
        r.showPings = false;
        cam.width = cam.height = c.worldSize;
        cam.position.set(Math.round(c.x * c.scale) / c.scale, Math.round(c.y * c.scale) / c.scale);
        c.fbo.begin(Color.clear);
        begun = true;
        r.draw();
        Draw.flush();
    }finally{
        if(begun) c.fbo.end();
        cam.width = w;
        cam.height = h;
        cam.position.set(px, py);
        cam.update();
        r.drawWeather = weather;
        r.showPings = pings;
    }
}

function detailText(x, y, text){
    return "[lightgray](" + Math.round(x / Vars.tilesize) + ", " + Math.round(y / Vars.tilesize) + ")" + (text ? " [white]" + text : "");
}

function addCard(source, x, y, text){
    const pid = prop(source, "id");
    const existing = cards.find(c => c.player == pid);
    if(existing != null){
        existing.x = x;
        existing.y = y;
        existing.start = Time.millis();
        existing.detail.setText(detailText(x, y, text));
        return;
    }

    const scale = previewScale() * SUPERSAMPLE;
    const worldSize = previewSize();
    const res = worldSize * scale;
    const shown = res / SUPERSAMPLE;
    const c = {player: pid, x: x, y: y, scale: scale, shown: shown, worldSize: worldSize, fbo: new FrameBuffer(res, res), start: Time.millis()};
    c.fbo.getTexture().setFilter(Texture.TextureFilter.linear);
    const region = new TextureRegion(c.fbo.getTexture());
    region.flip(false, true);

    const t = new Table(Styles.black6);
    t.margin(Scl.scl(4));
    const name = t.add(source.coloredName()).left().width(shown - Scl.scl(28)).get();
    name.setEllipsis(true);
    t.button(Icon.right, Styles.cleari, () => goTo(c.x, c.y)).size(Scl.scl(24)).right();
    t.row();
    c.detail = t.add(detailText(x, y, text)).left().colspan(2).width(shown).wrap().get();
    t.row();
    const img = new Image(region);
    img.clicked(() => goTo(c.x, c.y));
    t.add(img).size(shown).colspan(2).padTop(Scl.scl(3));

    t.update(() => {
        try{
            if(Time.timeSinceMillis(c.start) > CARD_SECONDS * 1000 || !Vars.state.isGame()){
                removeCard(c);
                return;
            }
            renderPreview(c);
        }catch(e){
            Log.err("[ping-alert] preview: " + e);
            removeCard(c);
        }
    });
    c.table = t;

    cards.push(c);
    while(cards.length > maxCards()) removeCard(cards[0]);
    rebuildCards();
}

function announce(source, x, y, text){
    if(on(SOUND_PREF)) Sounds.uiChat.play();

    if(on(CHAT_PREF)){
        let line = "[accent]ping[] " + source.coloredName() + "[lightgray] at (" +
            Math.round(x / Vars.tilesize) + ", " + Math.round(y / Vars.tilesize) + ")";
        if(text) line += "[white]: " + text;
        Vars.ui.chatfrag.addMessage(line);
    }

    if(on(CARDS_PREF)) addCard(source, x, y, text);
}

function onPing(source, x, y, text){
    if(source == null || Vars.player == null || source == Vars.player) return;
    if(source.team() != Vars.player.team() || !Vars.renderer.showPings) return;

    announce(source, x, y, text);
    if(on(ARROW_PREF)) showArrow(source, x, y);
}

function prop(o, name){
    const v = o[name];
    return typeof v === "function" ? o[name]() : v;
}

let ownPingTime = 0;
function checkOwnPing(){
    const pl = Vars.player;
    if(pl == null || !Vars.state.isGame()) return;
    const t = prop(pl, "pingTime");
    if(t > ownPingTime + 0.001 && t > 0.9 && Vars.renderer.showPings && on(SOUND_PREF)){
        Sounds.uiChat.play();
    }
    ownPingTime = t;
}

function afterUpdate(fn){
    Core.app.post(() => Core.app.post(fn));
}

function checkLater(){
    afterUpdate(() => {
        try{
            checkOwnPing();
        }catch(e){
            Log.err("[ping-alert] " + e);
        }
    });
}

function clearArrows(){
    Object.keys(arrows).forEach(id => { arrows[id].remove(); delete arrows[id]; });
}
function clearCards(){
    while(cards.length > 0) removeCard(cards[0]);
}

function dependentSlider(name, def, min, max, step, sp, enabled){
    Core.settings.defaults(name, new java.lang.Integer(def));
    const inner = new SettingsMenuDialog.SettingsTable.SliderSetting(name, def, min, max, step, sp, null);
    return extend(SettingsMenuDialog.SettingsTable.Setting, name, {
        add(table){
            inner.add(table);
            const row = table.getChildren().peek();
            const slider = row.getChildren().first();
            row.update(() => {
                const active = enabled();
                slider.setDisabled(!active);
                row.touchable = active ? Touchable.enabled : Touchable.disabled;
                row.color.a = active ? 1 : 0.4;
            });
        }
    });
}

cur1e.settings({mod: "ping-alert", title: "ping-alert.settings.title", icon: "chat", build: t => {
    t.checkPref(SOUND_PREF, true);
    t.checkPref(CHAT_PREF, true);
    t.checkPref(ARROW_PREF, true, v => { if(!v) clearArrows(); });
    t.checkPref(CARDS_PREF, true, v => { if(!v) clearCards(); });
    const cardsOn = () => on(CARDS_PREF);
    t.pref(dependentSlider("pingalert-cards", MAX_CARDS_DEFAULT, 1, 3, 1, v => "" + v, cardsOn));
    t.pref(dependentSlider("pingalert-preview", PREVIEW_SIZE_DEFAULT, 64, 240, 8, v => v + " px", cardsOn));
}});

Core.input.addProcessor(extend(InputProcessor, {
    keyDown(key){ checkLater(); return false; },
    keyUp(key){ checkLater(); return false; },
    touchUp(x, y, pointer, button){ checkLater(); return false; }
}));

function safe(source, p){
    try{
        onPing(source, p.x, p.y, p.text);
    }catch(e){
        Log.err("[ping-alert] " + e);
    }
}

Vars.net.handleClient(PingLocationCallPacket, p => {
    p.handleClient();
    safe(p.player, p);
});

Vars.net.handleServer(PingLocationCallPacket, (con, p) => {
    p.handleServer(con);
    safe(con.player, p);
});

Log.info("[ping-alert] loaded");
