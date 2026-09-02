const express = require('express');
const { monitorHttpAuthMiddleware } = require('../middleware');

const router = express.Router();
router.use(monitorHttpAuthMiddleware);

function pageHtml() {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auftrag an Slack</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; background: #f7f7f8; color: #111; }
      .wrap { max-width: 1120px; margin: 0 auto; padding: 16px 14px 36px; }
      .topbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
      .topbar a { color: #0a5bd3; text-decoration: none; }
      h1 { font-size: 20px; margin: 0; }
      .card { background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; padding: 10px; box-shadow: 0 1px 0 rgba(0,0,0,0.03); }
      .grid { display: grid; gap: 4px; }
      @media (min-width: 820px) {
        .grid-2 { grid-template-columns: 1fr 1fr; }
        .grid-3 { grid-template-columns: 1fr 1fr 1fr; }
      }
      @media (min-width: 1100px) {
        .grid-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
      }
      label { display: grid; gap: 0px; font-size: 12px; font-weight: 800; line-height: 1.05; }
      input, select, textarea, button { font: inherit; }
      input, select, textarea { padding: 4px 8px; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; font-weight: 400; font-size: 14px; line-height: 1.2; }
      input:disabled, select:disabled, textarea:disabled { background: #f4f4f5; color: #71717a; cursor: not-allowed; }
      textarea { resize: vertical; min-height: 56px; }
      .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      .row > * { flex: 1 1 auto; }
      .seg { display: inline-flex; border: 1px solid #d4d4d8; border-radius: 8px; overflow: hidden; background: #fff; }
      .seg input { display: none; }
      .seg label { margin: 0; padding: 6px 10px; cursor: pointer; user-select: none; font-size: 12px; font-weight: 700; line-height: 1; }
      .seg input:checked + label { background: #111; color: #fff; }
      .muted { color: #52525b; font-size: 12px; }
      .items { display: grid; gap: 8px; margin-top: 6px; }
      .item { border: 1px solid #e4e4e7; border-radius: 10px; padding: 10px; background: #fcfcfd; }
      .item-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
      .item-title { font-weight: 600; }
      .btn { border: 1px solid #d4d4d8; background: #fff; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
      .btn.primary { background: #111; color: #fff; border-color: #111; }
      .btn.warn { background: #fff7ed; color: #9a3412; border-color: #fdba74; font-weight: 800; padding: 12px 16px; }
      .btn.warn.active { background: #b91c1c; color: #fff; border-color: #b91c1c; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14); }
      .btn.danger { background: #fff; color: #b91c1c; border-color: #fecaca; }
      .btn:disabled { opacity: .6; cursor: not-allowed; }
      .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 8px; }
      .hidden { display: none !important; }
      .status { margin-top: 8px; padding: 8px 10px; border-radius: 8px; border: 1px solid #e4e4e7; background: #fff; }
      .status.ok { border-color: #bbf7d0; background: #f0fdf4; }
      .status.err { border-color: #fecaca; background: #fef2f2; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      .calendar { border: 1px solid #d4d4d8; border-radius: 10px; background: #fff; padding: 6px; }
      .cal-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
      .cal-head .btn { padding: 6px 10px; }
      .cal-title { font-weight: 600; }
      .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .cal-dow { font-size: 12px; color: #52525b; text-align: center; padding: 2px 0; }
      .cal-day { border: 1px solid #e4e4e7; border-radius: 8px; background: #fff; padding: 6px 0; cursor: pointer; }
      .cal-day:disabled { opacity: .35; cursor: not-allowed; }
      .cal-day.sel { background: #111; border-color: #111; color: #fff; }
      .pill { border: 1px solid #e4e4e7; border-radius: 10px; padding: 8px; background: #fcfcfd; font-size: 12px; }
      .emergency-box { position: sticky; top: 8px; z-index: 4; border: 2px solid #fb923c; border-radius: 12px; background: linear-gradient(180deg, #fff7ed 0%, #fffbeb 100%); padding: 12px 14px; display: grid; gap: 8px; box-shadow: 0 8px 20px rgba(251, 146, 60, 0.10); }
      .emergency-box.active { border-color: #dc2626; background: linear-gradient(180deg, #fef2f2 0%, #fff1f2 100%); box-shadow: 0 10px 24px rgba(220, 38, 38, 0.16); }
      .emergency-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
      .emergency-title { font-size: 18px; font-weight: 900; letter-spacing: .03em; color: #9a3412; text-transform: uppercase; }
      .emergency-box.active .emergency-title { color: #991b1b; }
      .emergency-subtitle { color: #7c2d12; font-size: 13px; }
      .emergency-box.active .emergency-subtitle { color: #7f1d1d; }
      .emergency-state { display:inline-flex; align-items:center; justify-content:center; min-width: 110px; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 900; letter-spacing: .05em; background: #ffedd5; color: #9a3412; border: 1px solid #fdba74; }
      .emergency-box.active .emergency-state { background: #dc2626; color: #fff; border-color: #dc2626; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="topbar">
        <h1>Auftrag an Slack</h1>
        <div class="row" style="justify-content:flex-end;">
          <a href="/display">Monitor</a>
        </div>
      </div>

      <div class="card">
        <div class="grid" style="gap:4px;">
          <div id="emergencyBox" class="emergency-box">
            <div class="emergency-head">
              <div>
                <div class="emergency-title">Notfall-Sendung</div>
                <div class="emergency-subtitle">Bei Aktivierung wird beim Senden zusätzlich ein Slack-Alarm für Push-Benachrichtigungen ausgelöst.</div>
              </div>
              <div id="emergencyState" class="emergency-state">AUS</div>
            </div>
            <div class="row" style="justify-content:space-between; align-items:center; gap:8px;">
              <div class="muted">Nur für dringende Fälle verwenden.</div>
              <button class="btn warn" id="emergencyToggleBtn" type="button" aria-pressed="false">Notfall aktivieren</button>
            </div>
          </div>

          <div class="grid grid-2">
            <div class="muted">Typ</div>
            <div class="seg" role="tablist" aria-label="Typ">
              <input type="radio" id="mode-order" name="mode" value="order" checked />
              <label for="mode-order">Auftrag</label>
              <input type="radio" id="mode-question" name="mode" value="question" />
              <label for="mode-question">Offene Frage</label>
            </div>
          </div>
          <div class="grid grid-2">
            <div class="muted">Kundentyp</div>
            <div class="seg" role="tablist" aria-label="Kundentyp">
              <input type="radio" id="ct-private" name="customerType" value="private" checked />
              <label for="ct-private">Privat</label>
              <input type="radio" id="ct-business" name="customerType" value="business" />
              <label for="ct-business">Geschäft</label>
            </div>
          </div>

          <input id="createdDate" type="hidden" />
          <input id="date" type="hidden" />
          <input id="dueDate" type="hidden" />

          <div class="grid" style="gap:4px;">
            <div class="grid" style="gap:4px;">
              <div class="grid" style="grid-template-columns: 1fr; gap:4px;">
                <div style="display:grid; gap:4px;">
                  <div class="grid" style="grid-template-columns: 1fr; gap:4px;">
                    <div class="grid" style="grid-template-columns: 1fr 1fr 1.1fr; gap:4px;">
                      <label>
                        Firma
                        <input id="company" list="company-list" autocomplete="organization" placeholder="z.B. Muster GmbH" />
                        <datalist id="company-list"></datalist>
                      </label>
                      <label>
                        <span id="orderRefLabel">Auftragsreferenz</span>
                        <input id="orderRef" placeholder="z.B. AB-123 / Baustelle ..." />
                      </label>

                      <div style="grid-row: 1 / span 2;">
                        <div class="row" style="justify-content:space-between; align-items:center; gap:8px;">
                          <div class="muted" id="calendarLabel">Montagetermin</div>
                          <button class="btn hidden" id="clearDateBtn" type="button">Kein Datum</button>
                        </div>
                        <div id="montageDisplay" class="pill" style="margin: 2px 0 4px 0;"></div>
                        <div id="calendar" class="calendar"></div>
                      </div>

                      <label>
                        Name / Ansprechpartner
                        <input id="name" autocomplete="name" placeholder="z.B. Max Mustermann" />
                      </label>
                      <label>
                        Straße und Hausnummer
                        <input id="street" autocomplete="street-address" placeholder="Musterstraße 1" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="grid" style="padding-left: 2px;">
              <label>
                Ort
                <input id="city" autocomplete="address-level2" placeholder="Musterstadt" />
              </label>
            </div>
          </div>

          <div id="private-extra" class="grid grid-2">
            <label>
              Telefon
              <input id="phone" autocomplete="tel" inputmode="tel" placeholder="+49 ..." />
            </label>
            <label>
              E-Mail
              <input id="email" autocomplete="email" inputmode="email" placeholder="mail@..." />
            </label>
            <label>
              PLZ
              <input id="zip" autocomplete="postal-code" inputmode="numeric" placeholder="12345" />
            </label>
          </div>

          <div id="question-block" class="grid grid-3 hidden">
            <label>
              Antwort von (Kürzel)
              <select id="assignee">
                <option value="" selected>—</option>
              </select>
            </label>
            <label>
              Referenz (optional)
              <input id="questionRef" placeholder="z.B. Vonovia 510 XXX XXX" />
            </label>
            <label>
              Link (optional)
              <input id="questionUrl" inputmode="url" placeholder="https://..." />
            </label>
          </div>

          <div id="question-search-block" class="hidden">
            <label>
              Suche in Slack (optional)
              <input id="historySearch" autocomplete="off" placeholder="z.B. Vonovia 510 / Kunde / Straße ..." />
            </label>
            <div id="historyResults" class="items" style="margin-top:6px;"></div>
          </div>

          <div id="question-text-block" class="hidden">
            <label>
              Frage / Notiz
              <textarea id="questionText" placeholder="Beschreibe kurz die offene Frage…"></textarea>
            </label>
          </div>

          <div id="order-items-block">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <div>
                <div style="font-weight:600;">Positionen</div>
                <div class="muted">Dropdown + Freitext. Mit + kannst du weitere (auch identische) Positionen hinzufügen.</div>
              </div>
              <div class="row" style="flex:0 0 auto;">
                <button class="btn" id="addItemBtn" type="button">+ Position</button>
              </div>
            </div>
            <div id="items" class="items"></div>
          </div>

          <div id="order-notes-block">
            <label>
              Hinweise (optional)
              <textarea id="notes" placeholder="z.B. Lieferzeit, Rückfragen, Besonderheiten..."></textarea>
            </label>
          </div>

          <div class="actions">
            <button class="btn primary" id="submitBtn" type="button">An Slack senden</button>
          </div>
          <div id="status" class="status hidden"></div>
        </div>
      </div>
    </div>

    <template id="itemTemplate">
      <div class="item">
        <div class="item-head">
          <div class="item-title"></div>
          <div class="row" style="flex:0 0 auto;">
            <button class="btn" data-action="duplicate" type="button">Duplizieren</button>
            <button class="btn danger" data-action="remove" type="button">Entfernen</button>
          </div>
        </div>
        <div class="grid grid-2">
          <label>
            Art
            <select data-field="type"></select>
          </label>
          <label data-block="insectSubtype" class="hidden">
            Unterkategorie
            <select data-field="insectSubtype">
              <option value="" selected>—</option>
              <option value="Spannrahmen">Spannrahmen</option>
              <option value="Rollo">Rollo</option>
              <option value="Tür">Tür</option>
            </select>
          </label>
          <label data-block="partsVendor" class="hidden">
            Anbieter
            <select data-field="partsVendor">
              <option value="" selected>—</option>
              <option value="Rademacher/Delta Dore">Rademacher/Delta Dore</option>
              <option value="Erfal">Erfal</option>
              <option value="Hella">Hella</option>
              <option value="May">May</option>
              <option value="Viktor Müller">Viktor Müller</option>
              <option value="Sonstige">Sonstige</option>
            </select>
          </label>
        </div>

        <div data-block="insectCommon" class="grid hidden" style="margin-top:10px;">
          <div class="grid grid-4">
            <label>
              Breite (mm) - Ohne Abzüge eintragen!
              <input data-field="insectWidthMm" inputmode="numeric" placeholder="z.B. 1000" />
            </label>
            <label>
              Höhe (mm) - Ohne Abzüge eintragen!
              <input data-field="insectHeightMm" inputmode="numeric" placeholder="z.B. 1500" />
            </label>
            <label>
              Farbe
              <select data-field="insectColor">
                <option value="" selected>—</option>
                <option value="Weiß">Weiß</option>
                <option value="Silber">Silber</option>
                <option value="Anthrazit">Anthrazit</option>
                <option value="Grau">Grau</option>
                <option value="Graubraun">Graubraun</option>
                <option value="Sonderfarbe">Sonderfarbe / RAL im Bemerkungsfeld</option>
              </select>
            </label>
            <label>
              Gaze-Art
              <select data-field="insectMesh">
                <option value="" selected>—</option>
                <option value="Standard">Standard</option>
                <option value="Durchblick">Durchblick</option>
                <option value="Pollenschutz">Pollenschutz</option>
                <option value="Reißfest">Reißfest</option>
                <option value="Edelstahl">Edelstahl</option>
                <option value="Petscreen">Petscreen</option>
                <option value="Sonstige">Sonstige</option>
              </select>
            </label>
          </div>
          <div data-block="insectSpecialColorHint" class="muted hidden">Sonderfarben bitte mit RAL-Angabe im Bemerkungsfeld hinterlegen.</div>
        </div>

        <div data-block="insectSpannrahmen" class="grid hidden" style="margin-top:10px;">
          <div class="grid grid-3">
            <label>
              Lage
              <select data-field="spannPosition">
                <option value="" selected>—</option>
                <option value="innenliegend">innenliegend</option>
                <option value="außenliegend">außenliegend</option>
              </select>
            </label>
            <label>
              Federstifte
              <select data-field="spannFederstifte">
                <option value="" selected>—</option>
                <option value="Ja">Ja</option>
                <option value="Nein">Nein</option>
              </select>
            </label>
            <label>
              Hakenmaß X (mm)
              <select data-field="spannHakenLengthMm">
                <option value="">—</option>
                <option value="4" selected>4</option>
                <option value="6">6</option>
                <option value="8">8</option>
                <option value="9">9</option>
                <option value="10">10</option>
                <option value="11">11</option>
                <option value="12">12</option>
                <option value="14">14</option>
                <option value="16">16</option>
                <option value="18">18</option>
                <option value="19">19</option>
                <option value="20">20</option>
                <option value="21">21</option>
                <option value="22">22</option>
                <option value="24">24</option>
                <option value="26">26</option>
                <option value="28">28</option>
                <option value="30">30</option>
                <option value="32">32</option>
                <option value="34">34</option>
                <option value="36">36</option>
                <option value="38">38</option>
                <option value="40">40</option>
              </select>
            </label>
          </div>
          <div class="grid grid-2">
            <label>
              Lage der Bürste
              <select data-field="spannBrushPosition">
                <option value="zum Fenster" selected>zum Fenster</option>
                <option value="Abdichtung nach unten">Abdichtung nach unten</option>
              </select>
            </label>
            <label>
              Bürstenlänge (mm)
              <select data-field="spannBrushLengthMm">
                <option value="8" selected>8</option>
                <option value="12">12</option>
                <option value="20">20</option>
              </select>
            </label>
          </div>
          <label>
            Stabilisierungsprofil
            <select data-field="spannStabilizationMode">
              <option value="Auto" selected>Automatisch (ab 1250 mm Höhe)</option>
              <option value="Ja">Ja, auch früher einsetzen</option>
              <option value="Nein">Nein, nur ausnahmsweise</option>
            </select>
          </label>
          <label>
            Bemerkungen (Spannrahmen)
            <textarea data-field="spannNotes" placeholder="optional"></textarea>
          </label>
        </div>

        <div data-block="insectRollo" class="grid hidden" style="margin-top:10px;">
          <div class="grid grid-4">
            <label>
              Kassette
              <select data-field="rolloCassette">
                <option value="" selected>—</option>
                <option value="rund">rund</option>
                <option value="eckig">eckig</option>
              </select>
            </label>
            <label>
              FS-Abschluss
              <select data-field="rolloFsAbschluss">
                <option value="" selected>—</option>
                <option value="Ja">Ja</option>
                <option value="Nein">Nein</option>
              </select>
            </label>
            <label>
              Griff für SL-I
              <select data-field="rolloGripSli">
                <option value="" selected>—</option>
                <option value="Ja">Ja</option>
                <option value="Nein">Nein</option>
              </select>
            </label>
            <label>
              Stopp von unten (mm)
              <input data-field="rolloStopFromBottomMm" inputmode="numeric" placeholder="z.B. 90" />
            </label>
          </div>
          <label>
            Montage (Rollo)
            <input data-field="rolloMounting" placeholder="z.B. Montage mit Kleber / verschraubt / Laibung..." />
          </label>
          <label>
            Bemerkungen (Rollo)
            <textarea data-field="rolloNotes" placeholder="optional"></textarea>
          </label>
        </div>

        <div data-block="insectDoor" class="grid hidden" style="margin-top:10px;">
          <div class="grid grid-3">
            <label>
              Tür-Art
              <select data-field="doorKind">
                <option value="" selected>—</option>
                <option value="Schiebetür">Schiebetür</option>
                <option value="Pendeltür">Pendeltür</option>
                <option value="Drehtür">Drehtür</option>
              </select>
            </label>
            <label>
              Trittschutz
              <select data-field="doorKickplate">
                <option value="" selected>—</option>
                <option value="Ja">Ja</option>
                <option value="Nein">Nein</option>
              </select>
            </label>
            <label>
              Katzen-/Hundeklappe
              <select data-field="doorPetFlap">
                <option value="" selected>—</option>
                <option value="keine">keine</option>
                <option value="Katzenklappe">Katzenklappe</option>
              </select>
            </label>
          </div>

          <div data-block="insectSlidingDoor" class="grid hidden">
            <div class="grid grid-3">
              <label>
                Flügel
                <select data-field="doorWingCount">
                  <option value="" selected>—</option>
                  <option value="1-flügelig">1-flügelig</option>
                  <option value="2-flügelig">2-flügelig</option>
                </select>
              </label>
              <label>
                Schienenlänge oben (mm)
                <input data-field="doorRailTopMm" inputmode="numeric" placeholder="z.B. 1492" />
              </label>
              <label>
                Schienenlänge unten (mm)
                <input data-field="doorRailBottomMm" inputmode="numeric" placeholder="z.B. 1492" />
              </label>
            </div>
          </div>

          <label>
            Rahmen/Schienen (optional)
            <input data-field="doorFrameNotes" placeholder="z.B. Rahmenmaß / Schienen oben+unten / Besonderheiten..." />
          </label>
          <label>
            Bemerkungen (Tür)
            <textarea data-field="doorNotes" placeholder="optional"></textarea>
          </label>
        </div>

        <div data-block="panzer" class="grid hidden" style="margin-top:10px;">
          <div class="grid grid-2">
            <label>
              Material
              <div class="seg" aria-label="Material">
                <input type="radio" data-field="material" id="m-alu" name="material" value="alu" checked />
                <label for="m-alu">Alu</label>
                <input type="radio" data-field="material" id="m-pvc" name="material" value="pvc" />
                <label for="m-pvc">PVC</label>
              </div>
            </label>
            <label>
              Profil
              <div class="seg" aria-label="Profil">
                <input type="radio" data-field="profileCode" id="p-mini" name="profile" value="mini" checked />
                <label for="p-mini">37 / Mini</label>
                <input type="radio" data-field="profileCode" id="p-midi" name="profile" value="midi" />
                <label for="p-midi">45 / Midi</label>
                <input type="radio" data-field="profileCode" id="p-maxi" name="profile" value="maxi" />
                <label for="p-maxi">52 / Maxi</label>
                <input type="radio" data-field="profileCode" id="p-other" name="profile" value="other" />
                <label for="p-other">Sonstige</label>
              </div>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Farbe
              <select data-field="colorId"></select>
            </label>
            <label>
              Maße (mm)
              <input data-field="dimensions" placeholder="Breite × Höhe (z.B. 1000 × 1500)" title="Breite × Höhe in mm, z.B. 1000 × 1500" />
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Endleiste
              <div class="row" style="align-items:center;">
                <label style="display:flex; gap:8px; align-items:center; font-size:12px; font-weight:700;">
                  <input type="checkbox" data-field="endleisteEnabled" checked />
                  Vorhanden
                </label>
                <label style="display:flex; gap:8px; align-items:center; font-size:12px; font-weight:700;">
                  <input type="checkbox" data-field="endleisteHoles" checked />
                  Gebohrt
                </label>
              </div>
            </label>
            <label>
              Endleisten-Farbe
              <select data-field="endleisteColorId"></select>
            </label>
          </div>
        </div>

        <div data-block="vorsatzElement" class="grid hidden" style="margin-top:10px;">
          <div class="grid grid-2">
            <label>
              Element-Maße (mm)
              <input data-field="vorsatzElementDimensions" placeholder="Breite × Höhe (z.B. 1400 × 1700)" title="Breite × Höhe des fertigen Vorsatzelements in mm, z.B. 1400 × 1700" />
            </label>
            <label>
              Kastenfarbe
              <select data-field="vorsatzBoxColorId"></select>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Kastengröße
              <select data-field="vorsatzBoxSizeMm"></select>
            </label>
            <label>
              Welle
              <select data-field="vorsatzShaftId">
                <option value="w40">40er Welle</option>
                <option value="w60">60er Welle</option>
              </select>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Rollseite
              <select data-field="vorsatzRollSide"></select>
            </label>
            <label>
              Schienen
              <div class="row" style="align-items:center;">
                <label style="display:flex; gap:8px; align-items:center; font-size:12px; font-weight:700;">
                  <input type="radio" data-field="vorsatzElementRails" name="vorsatzElementRails" value="ja" />
                  Ja
                </label>
                <label style="display:flex; gap:8px; align-items:center; font-size:12px; font-weight:700;">
                  <input type="radio" data-field="vorsatzElementRails" name="vorsatzElementRails" value="nein" checked />
                  Nein
                </label>
              </div>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Schienenlänge (mm)
              <input data-field="vorsatzRailLengthMm" inputmode="numeric" placeholder="z.B. 1520" title="Wird automatisch berechnet: Elementhöhe − Kastengröße. Kann manuell überschrieben werden." />
            </label>
            <label>
              Bedienung
              <div class="seg" aria-label="Bedienung Vorsatz MIT Panzer">
                <input type="radio" data-field="vorsatzControl" name="vorsatzControl" value="strap" checked />
                <label for="">Gurt / Kordel</label>
                <input type="radio" data-field="vorsatzControl" name="vorsatzControl" value="motor" />
                <label for="">Motor</label>
              </div>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Gurtgröße
              <select data-field="vorsatzStrapSize"></select>
            </label>
            <label>
              Gurtaustritt
              <select data-field="vorsatzStrapExit"></select>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Kabelaustritt (bei Motor)
              <select data-field="vorsatzMotorExit"></select>
            </label>
            <label>
              Bedienseite
              <select data-field="vorsatzOperatingSide"></select>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Panzer Material
              <div class="seg" aria-label="Panzer Material">
                <input type="radio" data-field="vorsatzPanzerMaterial" name="vorsatzPanzerMaterial" value="alu" checked />
                <label for="">Alu</label>
                <input type="radio" data-field="vorsatzPanzerMaterial" name="vorsatzPanzerMaterial" value="pvc" />
                <label for="">PVC</label>
              </div>
            </label>
            <label>
              Panzer Profil
              <select data-field="vorsatzPanzerProfileId">
                <option value="mini_37">37 / Mini</option>
                <option value="midi_45">45 / Midi</option>
                <option value="maxi_52">52 / Maxi</option>
                <option value="other">Sonstige</option>
              </select>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Panzer Farbe
              <select data-field="vorsatzPanzerColorId"></select>
            </label>
            <label>
              Panzer Endleiste
              <div class="row" style="align-items:center;">
                <label style="display:flex; gap:8px; align-items:center; font-size:12px; font-weight:700;">
                  <input type="checkbox" data-field="vorsatzEndleisteEnabled" checked />
                  vorhanden
                </label>
                <label style="display:flex; gap:8px; align-items:center; font-size:12px; font-weight:700;">
                  <input type="checkbox" data-field="vorsatzEndleisteHoles" checked />
                  gebohrt
                </label>
              </div>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Panzer Endleisten-Farbe
              <select data-field="vorsatzEndleisteColorId"></select>
            </label>
            <label style="display:flex; align-items:flex-end;">
              <div class="row" style="justify-content:space-between; align-items:center; width:100%; gap:14px;">
                <div>
                  <div style="font-size:12px; font-weight:700; margin-bottom:4px;">Errechnete Panzer-Maße</div>
                  <div data-field="vorsatzPanzerDimensionsInfo" style="font-size:12px; line-height:1.35;">-</div>
                </div>
                <div style="text-align:right; font-size:12px; opacity:.85;">
                  <div data-field="vorsatzBoxHint">-</div>
                </div>
              </div>
            </label>
          </div>
        </div>

        <div data-block="vorsatzBoxOnly" class="grid hidden" style="margin-top:10px;">
          <div class="grid grid-2">
            <label>
              Kastenbreite gesamt (mm, mit Endkappen)
              <input data-field="boxOnlyBoxWidthMm" inputmode="numeric" placeholder="z.B. 1465" title="Gesamtbreite des Kastens inklusive Endkappen in mm" />
            </label>
            <label>
              Kastenfarbe
              <select data-field="boxOnlyBoxColorId"></select>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Kastengröße
              <select data-field="boxOnlyBoxSizeMm"></select>
            </label>
            <label>
              Rollseite
              <select data-field="boxOnlyRollSide"></select>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Schienen
              <div class="row" style="align-items:center;">
                <label style="display:flex; gap:8px; align-items:center; font-size:12px; font-weight:700;">
                  <input type="radio" data-field="boxOnlyRails" name="boxOnlyRails" value="ja" />
                  Ja
                </label>
                <label style="display:flex; gap:8px; align-items:center; font-size:12px; font-weight:700;">
                  <input type="radio" data-field="boxOnlyRails" name="boxOnlyRails" value="nein" checked />
                  Nein
                </label>
              </div>
            </label>
            <label>
              Schienenlänge (mm)
              <input data-field="boxOnlyRailLengthMm" inputmode="numeric" placeholder="bei Schienen Ja erforderlich" title="Nur bei Schienen Ja ausfüllen; Schienenlänge in mm" />
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Bedienung
              <div class="seg" aria-label="Bedienung Vorsatzkasten">
                <input type="radio" data-field="boxOnlyControl" name="boxOnlyControl" value="strap" checked />
                <label for="">Gurt / Kordel</label>
                <input type="radio" data-field="boxOnlyControl" name="boxOnlyControl" value="motor" />
                <label for="">Motor</label>
              </div>
            </label>
            <label>
              Bedienseite
              <select data-field="boxOnlyOperatingSide"></select>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Gurtgröße
              <select data-field="boxOnlyStrapSize"></select>
            </label>
            <label>
              Gurtaustritt
              <select data-field="boxOnlyStrapExit"></select>
            </label>
          </div>

          <div class="grid grid-2">
            <label>
              Kabelaustritt (bei Motor)
              <select data-field="boxOnlyMotorExit"></select>
            </label>
          </div>
        </div>

        <div data-block="free" class="grid" style="margin-top:10px;">
          <label>
            Details / Freitext
            <textarea data-field="freeText" placeholder="z.B. Maße, Ausführung, Stückliste… (mehrere Teile bitte mit Komma trennen)"></textarea>
          </label>
        </div>
      </div>
    </template>

    <script>
      const STORAGE = {
        companies: 'intake:companies'
      };

      function normalize(s) {
        return String(s ?? '')
          .replace(/[\\u00AD\\u200B\\u200C\\u200D\\uFEFF]/g, '')
          .replace(/\\s+/g, ' ')
          .trim();
      }

      function escapeHtml(s) {
        return String(s ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      async function copyText(text) {
        const t = String(text ?? '');
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(t);
            return true;
          }
        } catch (e) {}
        try {
          const ta = document.createElement('textarea');
          ta.value = t;
          ta.setAttribute('readonly', 'readonly');
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          ta.setSelectionRange(0, t.length);
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return !!ok;
        } catch (e) {}
        return false;
      }

      function el(tag, attrs, children) {
        const node = document.createElement(tag);
        if (attrs) {
          Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'class') node.className = v;
            else if (k === 'html') node.innerHTML = v;
            else node.setAttribute(k, v);
          });
        }
        (children || []).forEach(c => node.appendChild(c));
        return node;
      }

      function text(s) { return document.createTextNode(String(s ?? '')); }

      function loadList(key, fallback) {
        try {
          const v = JSON.parse(localStorage.getItem(key) || 'null');
          if (Array.isArray(v)) return v.map(normalize).filter(Boolean);
        } catch (e) {}
        return Array.isArray(fallback) ? fallback.slice() : [];
      }

      function saveList(key, values) {
        const uniq = Array.from(new Set(values.map(normalize).filter(Boolean))).slice(0, 200);
        localStorage.setItem(key, JSON.stringify(uniq));
      }

      function fillDatalist(id, values) {
        const el = document.getElementById(id);
        el.innerHTML = '';
        values.forEach(v => {
          const o = document.createElement('option');
          o.value = v;
          el.appendChild(o);
        });
      }

      const itemTypeList = [
        'Rollladenpanzer',
        'Vorsatzelement',
        'Vorsatzkasten (ohne Panzer)',
        'Insektenschutz',
        'Reparatur',
        'Einzelteile',
        'Sonstiges'
      ];

      const companyList = loadList(STORAGE.companies, []);
      fillDatalist('company-list', companyList);

      const itemsEl = document.getElementById('items');
      const itemTpl = document.getElementById('itemTemplate');
      const statusEl = document.getElementById('status');
      const submitBtn = document.getElementById('submitBtn');
      const addItemBtn = document.getElementById('addItemBtn');

      function setStatus(kind, msg) {
        statusEl.classList.remove('hidden', 'ok', 'err');
        statusEl.classList.add(kind === 'ok' ? 'ok' : 'err');
        statusEl.innerHTML = msg;
      }

      function clearStatus() {
        statusEl.className = 'status hidden';
        statusEl.textContent = '';
      }

      function isPanzerType(t) {
        const x = normalize(t).toLowerCase();
        return x === 'rollladenpanzer' || x === 'panzer';
      }

      function isInsectType(t) {
        return normalize(t).toLowerCase() === 'insektenschutz';
      }

      function isPartsType(t) {
        return normalize(t).toLowerCase() === 'einzelteile';
      }

      function isVorsatzType(t) {
        return normalize(t).toLowerCase() === 'vorsatzelement';
      }

      function isVorsatzBoxOnlyType(t) {
        return normalize(t).toLowerCase().startsWith('vorsatzkasten');
      }

      function parseDimensions(raw) {
        const s = normalize(String(raw || '')).replace(/mm/gi, '').trim();
        if (!s) return null;
        const m = s.match(/(\d{3,5})\s*(?:x|×|X)\s*(\d{3,5})/);
        if (!m) return null;
        return { width: Number(m[1]), height: Number(m[2]) };
      }

      const VORSATZ_CONTROL_OPTIONS = [
        { id: 'strap', label: 'Gurt / Kordel' },
        { id: 'motor', label: 'Motor' }
      ];

      const VORSATZ_BOX_SIDE_OPTIONS = [
        { id: 'links', label: 'Linksroller (Ansicht von innen)' },
        { id: 'rechts', label: 'Rechtsroller (Ansicht von innen)' }
      ];

      const VORSATZ_BOX_OPERATING_SIDE = [
        { id: 'links', label: 'Links' },
        { id: 'rechts', label: 'Rechts' }
      ];

      const VORSATZ_STRAP_SIZES = [
        { id: 's12', label: '12 mm' },
        { id: 's14', label: '14 mm' },
        { id: 's18', label: '18 mm' },
        { id: 's23', label: '23 mm' },
        { id: 'cord', label: 'Kordel' }
      ];

      const VORSATZ_EXIT_OPTIONS = [
        { id: 'hinten', label: 'Hinten' },
        { id: 'unten', label: 'Unten' },
        { id: 'oben', label: 'Oben' },
        { id: 'seite', label: 'Seite' }
      ];

      const VORSATZ_STRAP_EXIT_OPTIONS = [
        { id: 'hinten', label: 'Hinten' },
        { id: 'unten', label: 'Unten' }
      ];

      const VORSATZ_BOX_SIZES = [100, 125, 138, 150, 165, 180, 205, 220, 235, 250];

      const VORSATZ_SHAFT_OPTIONS = [
        { id: 'w40', label: '40er Welle' },
        { id: 'w60', label: '60er Welle' }
      ];

      const VORSATZ_PROFILE_MAX_HEIGHT = {
        mini_37: {
          w40: { 100: 640, 125: 1300, 138: 1600, 150: 2120, 165: 2750, 180: 3420, 205: 4490, 220: null, 235: null, 250: null },
          w60: { 100: null, 125: 1020, 138: 1360, 150: 1930, 165: 2530, 180: 3160, 205: 4300, 220: null, 235: null, 250: null }
        },
        maxi_52: {
          w40: { 100: null, 125: null, 138: null, 150: null, 165: null, 180: null, 205: null, 220: null, 235: null, 250: null },
          w60: { 100: null, 125: null, 138: 900, 150: 1250, 165: 1500, 180: 2200, 205: 2800, 220: null, 235: null, 250: null }
        }
      };
      VORSATZ_PROFILE_MAX_HEIGHT.midi_45 = VORSATZ_PROFILE_MAX_HEIGHT.mini_37;

      function suggestVorsatzBoxSize({ profileId, shaftId, elementHeightMm }) {
        const h = Number(elementHeightMm || 0);
        if (!h) return null;
        const table =
          VORSATZ_PROFILE_MAX_HEIGHT[profileId] &&
          VORSATZ_PROFILE_MAX_HEIGHT[profileId][shaftId]
            ? VORSATZ_PROFILE_MAX_HEIGHT[profileId][shaftId]
            : null;
        if (!table) return null;
        for (const s of VORSATZ_BOX_SIZES) {
          const max = table[s];
          if (max == null) continue;
          if (h <= max) return s;
        }
        return 205;
      }

      const COLOR_OPTIONS = {
        pvc_mini: [
          { id: 'beige', label: 'Beige' },
          { id: 'weiss', label: 'Weiß' },
          { id: 'grau', label: 'Grau' },
          { id: 'altweiss', label: 'Altweiß' },
          { id: 'hellelfenbein', label: 'Hellelfenbein (= RAL 1015)' },
          { id: 'holzhell', label: 'Holz hell' },
          { id: 'oregon', label: 'Oregon' },
          { id: 'holzdunkel', label: 'Holz dunkel' },
          { id: 'graubraun', label: 'Graubraun (= RAL 8019)' }
        ],
        pvc_maxi: [
          { id: 'beige', label: 'Beige' },
          { id: 'weiss', label: 'Weiß' },
          { id: 'grau', label: 'Grau' },
          { id: 'altweiss', label: 'Altweiß' },
          { id: 'hellelfenbein', label: 'Hellelfenbein (= RAL 1015)' },
          { id: 'holzhell', label: 'Holz hell' },
          { id: 'oregon', label: 'Oregon' },
          { id: 'holzdunkel', label: 'Holz dunkel' },
          { id: 'graubraun', label: 'Graubraun (= RAL 8019)' }
        ],
        alu_mini: [
          { id: 'beige', label: 'Beige' },
          { id: 'weiss', label: 'Weiß' },
          { id: 'grau', label: 'Grau' },
          { id: 'silber', label: 'Silber (= RAL 9006)' },
          { id: 'cremeweiss', label: 'Cremeweiß (= RAL 9001)' },
          { id: 'hellelfenbein', label: 'Hellelfenbein (= RAL 1015)' },
          { id: 'grauweiss', label: 'Grauweiß (= RAL 9002)' },
          { id: 'holzhell', label: 'Holz hell' },
          { id: 'goldenoak', label: 'GoldenOak' },
          { id: 'graubraun', label: 'Graubraun (= RAL 8019)' },
          { id: 'anthrazitgrau', label: 'Anthrazitgrau (= RAL 7016)' },
          { id: 'eisenglimmer', label: 'Eisenglimmer (= DB 703)' },
          { id: 'moosgruen', label: 'Moosgrün (= RAL 6005)' },
          { id: 'graualuminium', label: 'Graualuminium (= RAL 9007)' },
          { id: 'perlweiss', label: 'Perlweiß (= RAL 1013)' },
          { id: 'antikweiss', label: 'Antikweiß' },
          { id: 'altweiss', label: 'Altweiß' },
          { id: 'oregon', label: 'Oregon' },
          { id: 'holzdunkel', label: 'Holz dunkel' }
        ],
        alu_maxi: [
          { id: 'beige', label: 'Beige' },
          { id: 'weiss', label: 'Weiß' },
          { id: 'grau', label: 'Grau' },
          { id: 'silber', label: 'Silber (= RAL 9006)' },
          { id: 'cremeweiss', label: 'Cremeweiß (= RAL 9001)' },
          { id: 'hellelfenbein', label: 'Hellelfenbein (= RAL 1015)' },
          { id: 'grauweiss', label: 'Grauweiß (= RAL 9002)' },
          { id: 'holzhell', label: 'Holz hell' },
          { id: 'goldenoak', label: 'GoldenOak' },
          { id: 'graubraun', label: 'Graubraun (= RAL 8019)' },
          { id: 'anthrazitgrau', label: 'Anthrazitgrau (= RAL 7016)' },
          { id: 'eisenglimmer', label: 'Eisenglimmer (= DB 703)' },
          { id: 'moosgruen', label: 'Moosgrün (= RAL 6005)' },
          { id: 'graualuminium', label: 'Graualuminium (= RAL 9007)' }
        ],
      };

      const ENDLEISTE_COLORS = [
        { id: 'silber_eloxiert', label: 'Silber eloxiert' },
        { id: 'beige', label: 'Beige' },
        { id: 'weiss', label: 'Weiß' },
        { id: 'grau', label: 'Grau' }
      ];

      const VORSATZ_COLORS = [
        { id: 'grau', label: 'Grau' },
        { id: 'weiss', label: 'Weiß' },
        { id: 'silber', label: 'Silber (= RAL 9006)' },
        { id: 'cremeweiss', label: 'Cremeweiß (= RAL 9001)' },
        { id: 'grauweiss', label: 'Grauweiß (= RAL 9002)' },
        { id: 'hellelfenbein', label: 'Hellelfenbein (= RAL 1015)' },
        { id: 'beige', label: 'Beige' },
        { id: 'graubraun', label: 'Graubraun (= RAL 8019)' },
        { id: 'anthrazitgrau', label: 'Anthrazitgrau (= RAL 7016)' },
        { id: 'moosgruen', label: 'Moosgrün (= RAL 6005)' },
        { id: 'goldenoak', label: 'GoldenOak' },
        { id: 'holzhell', label: 'Holz hell' },
        { id: 'holzdunkel', label: 'Holz dunkel' },
        { id: 'oregon', label: 'Oregon' },
        { id: 'sonstige', label: 'Sonstige / RAL (Bemerkung)' }
      ];

      const VORSATZ_ROLLO_PROFILES = [
        { id: 'mini_37', label: '37 / Mini' },
        { id: 'midi_45', label: '45 / Midi' },
        { id: 'maxi_52', label: '52 / Maxi' },
        { id: 'other', label: 'Sonstige' }
      ];

      const SPECIAL_INSECT_COLOR = 'Sonderfarbe';

      function fillSelect(selectEl, options, selectedId) {
        const prev = normalize(selectedId);
        selectEl.innerHTML = '';
        (options || []).forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.id;
          opt.textContent = o.label;
          if (o.disabled) opt.disabled = true;
          selectEl.appendChild(opt);
        });
        if (prev && Array.from(selectEl.options).some(x => x.value === prev)) {
          selectEl.value = prev;
        }
      }

      function getSelectedRadioValue(scopeEl, field) {
        const el = scopeEl.querySelector('input[data-field="' + field + '"]:checked');
        return el ? el.value : '';
      }

      function getColorsFor(material, profileCode) {
        const m = normalize(material).toLowerCase() === 'pvc' ? 'pvc' : 'alu';
        const p = normalize(profileCode).toLowerCase();
        if (p === 'other') {
          const a = COLOR_OPTIONS[m + '_mini'] || [];
          const b = COLOR_OPTIONS[m + '_maxi'] || [];
          const seen = new Set();
          return a.concat(b).filter(c => {
            if (!c || !c.id || seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
          });
        }

        const keyProfile = (p === 'maxi' ? 'maxi' : (p === 'mini' ? 'mini' : (p === 'midi' ? 'maxi' : 'mini')));
        const key = m + '_' + keyProfile;
        return COLOR_OPTIONS[key] || [];
      }

      function applyPanzerLogic(itemEl) {
        const material = getSelectedRadioValue(itemEl, 'material') || 'alu';
        const profileCode = getSelectedRadioValue(itemEl, 'profileCode') || 'mini';
        const colorSelect = itemEl.querySelector('[data-field="colorId"]');
        const colors = getColorsFor(material, profileCode);
        const prevColor = normalize(colorSelect.value);
        const wantedColor = normalize(colorSelect.dataset.wanted || '') || prevColor;
        fillSelect(colorSelect, colors, wantedColor);
        if (normalize(colorSelect.dataset.wanted)) delete colorSelect.dataset.wanted;
        if (!wantedColor && Array.from(colorSelect.options).some(o => o.value === 'grau')) {
          colorSelect.value = 'grau';
        }

        const endColorSelect = itemEl.querySelector('[data-field="endleisteColorId"]');
        const endleisteEnabledEl = itemEl.querySelector('[data-field="endleisteEnabled"]');
        const endleisteHolesEl = itemEl.querySelector('[data-field="endleisteHoles"]');
        const wantedEndColor = normalize(endColorSelect.dataset.wanted || '') || normalize(endColorSelect.value) || 'silber_eloxiert';
        fillSelect(endColorSelect, ENDLEISTE_COLORS, wantedEndColor);
        if (normalize(endColorSelect.dataset.wanted)) delete endColorSelect.dataset.wanted;
        if (!normalize(endColorSelect.value)) endColorSelect.value = 'silber_eloxiert';
        const endleisteEnabled = !endleisteEnabledEl || !!endleisteEnabledEl.checked;
        if (endColorSelect) endColorSelect.disabled = !endleisteEnabled;
        if (endleisteHolesEl) endleisteHolesEl.disabled = !endleisteEnabled;
      }

      function applyVorsatzLogic(itemEl) {
        return applyVorsatzElementLogic(itemEl, {});
      }

      function updateItemTitle(itemEl, idx) {
        const title = itemEl.querySelector('.item-title');
        title.textContent = 'Position ' + (idx + 1);
      }

      function updatePanzerVisibility(itemEl) {
        const type = itemEl.querySelector('[data-field="type"]').value;
        const isPanzer = isPanzerType(type);
        itemEl.querySelector('[data-block="panzer"]').classList.toggle('hidden', !isPanzer);
        if (isPanzer) {
          applyPanzerLogic(itemEl);
        }
        updateVorsatzVisibility(itemEl);
      }

      function applyVorsatzElementLogic(itemEl, opts) {
        opts = opts || {};

        const boxColorSelect = itemEl.querySelector('[data-field="vorsatzBoxColorId"]');
        const boxSizeSelect = itemEl.querySelector('[data-field="vorsatzBoxSizeMm"]');
        const shaftSelect = itemEl.querySelector('[data-field="vorsatzShaftId"]');
        const dimsInput = itemEl.querySelector('[data-field="vorsatzElementDimensions"]');
        const panzerProfileSelect = itemEl.querySelector('[data-field="vorsatzPanzerProfileId"]');
        const panzerColorSelect = itemEl.querySelector('[data-field="vorsatzPanzerColorId"]');
        const panzerEndColorSelect = itemEl.querySelector('[data-field="vorsatzEndleisteColorId"]');
        const panzerEndEnabledEl = itemEl.querySelector('[data-field="vorsatzEndleisteEnabled"]');
        const panzerEndHolesEl = itemEl.querySelector('[data-field="vorsatzEndleisteHoles"]');
        const dimsInfo = itemEl.querySelector('[data-field="vorsatzPanzerDimensionsInfo"]');
        const boxHint = itemEl.querySelector('[data-field="vorsatzBoxHint"]');
        const railsYesEl = itemEl.querySelector('[data-field="vorsatzElementRails"][value="ja"]');
        const railLengthInput = itemEl.querySelector('[data-field="vorsatzRailLengthMm"]');
        const rollSideSelect = itemEl.querySelector('[data-field="vorsatzRollSide"]');
        const controlEls = itemEl.querySelectorAll('[data-field="vorsatzControl"]');
        const strapSizeSelect = itemEl.querySelector('[data-field="vorsatzStrapSize"]');
        const strapExitSelect = itemEl.querySelector('[data-field="vorsatzStrapExit"]');
        const motorExitSelect = itemEl.querySelector('[data-field="vorsatzMotorExit"]');
        const operatingSideSelect = itemEl.querySelector('[data-field="vorsatzOperatingSide"]');

        fillSelect(boxColorSelect, VORSATZ_COLORS, normalize(boxColorSelect.dataset.wanted || boxColorSelect.value) || 'grau');
        if (boxColorSelect.dataset.wanted) delete boxColorSelect.dataset.wanted;
        if (!boxColorSelect.value && Array.from(boxColorSelect.options).some(o => o.value === 'grau')) boxColorSelect.value = 'grau';

        fillSelect(rollSideSelect, VORSATZ_BOX_SIDE_OPTIONS, normalize(rollSideSelect.dataset.wanted || rollSideSelect.value) || 'links');
        if (rollSideSelect.dataset.wanted) delete rollSideSelect.dataset.wanted;

        fillSelect(
          operatingSideSelect,
          VORSATZ_BOX_OPERATING_SIDE,
          normalize(operatingSideSelect.dataset.wanted || operatingSideSelect.value) || 'rechts'
        );
        if (operatingSideSelect.dataset.wanted) delete operatingSideSelect.dataset.wanted;

        let wantedControl = null;
        controlEls.forEach((c) => {
          if (c.checked || (c.dataset.wanted === c.value)) wantedControl = c.value;
        });
        wantedControl = wantedControl || 'strap';
        controlEls.forEach((c) => {
          if (c.dataset.wanted) delete c.dataset.wanted;
          c.checked = c.value === wantedControl;
        });
        const control = wantedControl;

        fillSelect(strapSizeSelect, VORSATZ_STRAP_SIZES, normalize(strapSizeSelect.dataset.wanted || strapSizeSelect.value) || 's14');
        if (strapSizeSelect.dataset.wanted) delete strapSizeSelect.dataset.wanted;
        fillSelect(strapExitSelect, VORSATZ_STRAP_EXIT_OPTIONS, normalize(strapExitSelect.dataset.wanted || strapExitSelect.value) || 'hinten');
        if (strapExitSelect.dataset.wanted) delete strapExitSelect.dataset.wanted;
        fillSelect(motorExitSelect, VORSATZ_EXIT_OPTIONS, normalize(motorExitSelect.dataset.wanted || motorExitSelect.value) || 'hinten');
        if (motorExitSelect.dataset.wanted) delete motorExitSelect.dataset.wanted;

        const currentBoxSize = Number(boxSizeSelect.value) || null;

        const wantedProfile =
          normalize(panzerProfileSelect.dataset.wanted || '') ||
          normalize(panzerProfileSelect.value) ||
          'mini_37';
        fillSelect(panzerProfileSelect, VORSATZ_ROLLO_PROFILES, wantedProfile);
        if (panzerProfileSelect.dataset.wanted) delete panzerProfileSelect.dataset.wanted;

        let wantedShaft = normalize(shaftSelect.dataset.wanted || '') || normalize(shaftSelect.value) || 'w40';
        if (panzerProfileSelect.value === 'maxi_52' && wantedShaft === 'w40') wantedShaft = 'w60';
        fillSelect(shaftSelect, VORSATZ_SHAFT_OPTIONS, wantedShaft);
        if (shaftSelect.dataset.wanted) delete shaftSelect.dataset.wanted;
        if (panzerProfileSelect.value === 'maxi_52' && shaftSelect.value === 'w40') shaftSelect.value = 'w60';
        shaftSelect.disabled = panzerProfileSelect.value === 'maxi_52';

        const wantedPanzerColor =
          normalize(panzerColorSelect.dataset.wanted || '') ||
          normalize(panzerColorSelect.value) ||
          'weiss';
        fillSelect(panzerColorSelect, VORSATZ_COLORS, wantedPanzerColor);
        if (panzerColorSelect.dataset.wanted) delete panzerColorSelect.dataset.wanted;
        if (!panzerColorSelect.value && Array.from(panzerColorSelect.options).some(o => o.value === 'weiss')) panzerColorSelect.value = 'weiss';

        fillSelect(
          panzerEndColorSelect,
          ENDLEISTE_COLORS,
          normalize(panzerEndColorSelect.dataset.wanted || '') || normalize(panzerEndColorSelect.value) || 'silber_eloxiert'
        );
        if (panzerEndColorSelect.dataset.wanted) delete panzerEndColorSelect.dataset.wanted;

        const dims = parseDimensions(dimsInput.value);
        const profileId = panzerProfileSelect.value;
        const shaftId = shaftSelect.value;
        const table =
          VORSATZ_PROFILE_MAX_HEIGHT[profileId] &&
          VORSATZ_PROFILE_MAX_HEIGHT[profileId][shaftId]
            ? VORSATZ_PROFILE_MAX_HEIGHT[profileId][shaftId]
            : null;
        const suggestedBox = suggestVorsatzBoxSize({
          profileId,
          shaftId,
          elementHeightMm: dims ? dims.height : null
        });
        const boxOptions = VORSATZ_BOX_SIZES.slice().map(bs => {
          if (!table) return { id: String(bs), label: bs + 'er', disabled: false };
          const maxH = table[bs];
          if (maxH == null) return { id: String(bs), label: bs + 'er (n.a.)', disabled: true };
          if (dims && dims.height > maxH) return { id: String(bs), label: bs + 'er (bis ' + maxH + ' mm)', disabled: true };
          return { id: String(bs), label: bs + 'er (bis ' + maxH + ' mm)', disabled: false };
        });
        const defaultBox = String(currentBoxSize || suggestedBox || VORSATZ_BOX_SIZES[3]);
        const validBoxOptions = boxOptions.filter(o => !o.disabled);
        const forcedDefault = validBoxOptions.some(o => o.id === defaultBox)
          ? defaultBox
          : (validBoxOptions[validBoxOptions.length - 1] ? validBoxOptions[validBoxOptions.length - 1].id : defaultBox);
        fillSelect(
          boxSizeSelect,
          boxOptions,
          String(currentBoxSize || forcedDefault)
        );
        if (!opts.keepBoxSize && suggestedBox && currentBoxSize !== suggestedBox) {
          boxSizeSelect.value = String(suggestedBox);
        }
        const chosenBox = Number(boxSizeSelect.value) || 0;
        const boxEntry = boxOptions.find(o => Number(o.id) === chosenBox);
        if (boxEntry && boxEntry.disabled) {
          const fallback = validBoxOptions[validBoxOptions.length - 1] || boxOptions[boxOptions.length - 1];
          boxSizeSelect.value = fallback.id;
        }

        const endEnabled = panzerEndEnabledEl ? !!panzerEndEnabledEl.checked : true;
        panzerProfileSelect.disabled = false;
        panzerColorSelect.disabled = false;
        if (panzerEndColorSelect) panzerEndColorSelect.disabled = !endEnabled;
        if (panzerEndEnabledEl) panzerEndEnabledEl.disabled = false;
        if (panzerEndHolesEl) panzerEndHolesEl.disabled = !endEnabled;

        const railYes = !!(railsYesEl && railsYesEl.checked);
        if (railLengthInput) {
          if (railYes && dims && boxSizeSelect.value) {
            const expected = Math.max(0, Math.round(dims.height - Number(boxSizeSelect.value)));
            const current = normalize(railLengthInput.dataset.wanted || railLengthInput.value);
            if (!current) railLengthInput.value = String(expected);
            if (railLengthInput.dataset.wanted) delete railLengthInput.dataset.wanted;
          } else if (railLengthInput.dataset.wanted) {
            railLengthInput.value = railLengthInput.dataset.wanted;
            delete railLengthInput.dataset.wanted;
          }
          railLengthInput.disabled = !railYes;
        }

        const isStrap = control === 'strap';
        strapSizeSelect.disabled = !isStrap;
        strapExitSelect.disabled = !isStrap;
        motorExitSelect.disabled = isStrap;

        const boxSize = Number(boxSizeSelect.value) || 0;
        const panzerDims = { width: null, height: null };
        if (dims && boxSize) {
          panzerDims.width = Math.max(0, dims.width - 65);
          panzerDims.height = Math.max(0, Math.round(dims.height - (boxSize / 2)));
        }
        if (dimsInfo) {
          if (!dims || !boxSize) {
            dimsInfo.textContent = 'Erst Element-Maße und Kastengröße ausfüllen.';
          } else {
            const pw = String(panzerDims.width);
            const ph = String(panzerDims.height);
            const ew = String(dims.width);
            const eh = String(dims.height);
            const bs = String(boxSize);
            const half = String(boxSize / 2);
            dimsInfo.textContent = (pw + ' × ' + ph + ' mm (Breite ' + ew + ' - 65; Höhe ' + eh + ' - ' + bs + '/2 = ' + half + ')');
          }
        }
        if (boxHint) {
          if (!table) {
            boxHint.textContent = 'Diese Konstellation (Maxi + 40er Welle) ist unzulässig – auf 60er umgestellt.';
          } else {
            const bs = Number(boxSizeSelect.value) || 0;
            const max = table[bs];
            const seg = [];
            if (max == null) seg.push(bs ? (bs + 'er: n.a.') : '');
            else {
              const hMm = dims ? dims.height : null;
              if (hMm == null) seg.push(bs ? (bs + 'er bis ' + max + ' mm') : '');
              else seg.push(hMm > max ? (hMm + ' mm AUSSERHALB ' + bs + 'er (' + max + ' mm) – 205er+ individuell prüfen') : (hMm + ' mm OK für ' + bs + 'er (bis ' + max + ' mm)'));
            }
            boxHint.textContent = seg.filter(Boolean).join(' ') || '-';
          }
        }
      }

      function applyVorsatzBoxOnlyLogic(itemEl, opts) {
        opts = opts || {};
        const boxColorSelect = itemEl.querySelector('[data-field="boxOnlyBoxColorId"]');
        const boxSizeSelect = itemEl.querySelector('[data-field="boxOnlyBoxSizeMm"]');
        const rollSideSelect = itemEl.querySelector('[data-field="boxOnlyRollSide"]');
        const railsYesEl = itemEl.querySelector('[data-field="boxOnlyRails"][value="ja"]');
        const railLengthInput = itemEl.querySelector('[data-field="boxOnlyRailLengthMm"]');
        const controlEls = itemEl.querySelectorAll('[data-field="boxOnlyControl"]');
        const operatingSideSelect = itemEl.querySelector('[data-field="boxOnlyOperatingSide"]');
        const strapSizeSelect = itemEl.querySelector('[data-field="boxOnlyStrapSize"]');
        const strapExitSelect = itemEl.querySelector('[data-field="boxOnlyStrapExit"]');
        const motorExitSelect = itemEl.querySelector('[data-field="boxOnlyMotorExit"]');
        const boxWidthInput = itemEl.querySelector('[data-field="boxOnlyBoxWidthMm"]');

        fillSelect(boxColorSelect, VORSATZ_COLORS, normalize(boxColorSelect.dataset.wanted || boxColorSelect.value) || 'grau');
        if (boxColorSelect.dataset.wanted) delete boxColorSelect.dataset.wanted;
        if (!boxColorSelect.value && Array.from(boxColorSelect.options).some(o => o.value === 'grau')) boxColorSelect.value = 'grau';

        const currentBoxSize = Number(boxSizeSelect.value) || null;
        fillSelect(
          boxSizeSelect,
          VORSATZ_BOX_SIZES.map(s => ({ id: String(s), label: s + 'er' })),
          String(currentBoxSize || 150)
        );
        if (boxSizeSelect.dataset.wanted) delete boxSizeSelect.dataset.wanted;

        fillSelect(rollSideSelect, VORSATZ_BOX_SIDE_OPTIONS, normalize(rollSideSelect.dataset.wanted || rollSideSelect.value) || 'links');
        if (rollSideSelect.dataset.wanted) delete rollSideSelect.dataset.wanted;

        fillSelect(
          operatingSideSelect,
          VORSATZ_BOX_OPERATING_SIDE,
          normalize(operatingSideSelect.dataset.wanted || operatingSideSelect.value) || 'rechts'
        );
        if (operatingSideSelect.dataset.wanted) delete operatingSideSelect.dataset.wanted;

        let wantedControl = null;
        controlEls.forEach((c) => {
          if (c.checked || (c.dataset.wanted === c.value)) wantedControl = c.value;
        });
        wantedControl = wantedControl || 'strap';
        controlEls.forEach((c) => {
          if (c.dataset.wanted) delete c.dataset.wanted;
          c.checked = c.value === wantedControl;
        });
        const control = wantedControl;

        fillSelect(strapSizeSelect, VORSATZ_STRAP_SIZES, normalize(strapSizeSelect.dataset.wanted || strapSizeSelect.value) || 's14');
        if (strapSizeSelect.dataset.wanted) delete strapSizeSelect.dataset.wanted;
        fillSelect(strapExitSelect, VORSATZ_STRAP_EXIT_OPTIONS, normalize(strapExitSelect.dataset.wanted || strapExitSelect.value) || 'hinten');
        if (strapExitSelect.dataset.wanted) delete strapExitSelect.dataset.wanted;
        fillSelect(motorExitSelect, VORSATZ_EXIT_OPTIONS, normalize(motorExitSelect.dataset.wanted || motorExitSelect.value) || 'hinten');
        if (motorExitSelect.dataset.wanted) delete motorExitSelect.dataset.wanted;

        if (boxWidthInput && boxWidthInput.dataset.wanted) {
          boxWidthInput.value = boxWidthInput.dataset.wanted;
          delete boxWidthInput.dataset.wanted;
        }
        if (railLengthInput) {
          if (railLengthInput.dataset.wanted) {
            railLengthInput.value = railLengthInput.dataset.wanted;
            delete railLengthInput.dataset.wanted;
          }
          const railYes = !!(railsYesEl && railsYesEl.checked);
          railLengthInput.disabled = !railYes;
        }

        const isStrap = control === 'strap';
        strapSizeSelect.disabled = !isStrap;
        strapExitSelect.disabled = !isStrap;
        motorExitSelect.disabled = isStrap;
      }

      function updateVorsatzVisibility(itemEl) {
        const type = itemEl.querySelector('[data-field="type"]').value;
        const isVorsatz = isVorsatzType(type);
        const isBoxOnly = isVorsatzBoxOnlyType(type);
        const block = itemEl.querySelector('[data-block="vorsatzElement"]');
        const blockBoxOnly = itemEl.querySelector('[data-block="vorsatzBoxOnly"]');
        if (block) block.classList.toggle('hidden', !isVorsatz);
        if (blockBoxOnly) blockBoxOnly.classList.toggle('hidden', !isBoxOnly);
        if (isVorsatz) applyVorsatzElementLogic(itemEl, { keepBoxSize: true });
        if (isBoxOnly) applyVorsatzBoxOnlyLogic(itemEl, { keepBoxSize: true });
      }

      function updateTypeDependentVisibility(itemEl) {
        const t = itemEl.querySelector('[data-field="type"]').value;
        const isInsect = isInsectType(t);
        itemEl.querySelector('[data-block="insectSubtype"]').classList.toggle('hidden', !isInsect);
        itemEl.querySelector('[data-block="insectCommon"]').classList.toggle('hidden', !isInsect);
        const sub = normalize(itemEl.querySelector('[data-field="insectSubtype"]')?.value);
        itemEl.querySelector('[data-block="insectSpannrahmen"]').classList.toggle('hidden', !(isInsect && sub === 'Spannrahmen'));
        itemEl.querySelector('[data-block="insectRollo"]').classList.toggle('hidden', !(isInsect && sub === 'Rollo'));
        itemEl.querySelector('[data-block="insectDoor"]').classList.toggle('hidden', !(isInsect && sub === 'Tür'));
        const doorKind = normalize(itemEl.querySelector('[data-field="doorKind"]')?.value);
        itemEl.querySelector('[data-block="insectSlidingDoor"]').classList.toggle('hidden', !(isInsect && sub === 'Tür' && doorKind === 'Schiebetür'));

        itemEl.querySelector('[data-block="partsVendor"]').classList.toggle('hidden', !isPartsType(t));
        applyInsectLogic(itemEl);
      }

      function getInsectNotesField(itemEl) {
        const sub = normalize(itemEl.querySelector('[data-field="insectSubtype"]')?.value);
        if (sub === 'Spannrahmen') return itemEl.querySelector('[data-field="spannNotes"]');
        if (sub === 'Rollo') return itemEl.querySelector('[data-field="rolloNotes"]');
        if (sub === 'Tür') return itemEl.querySelector('[data-field="doorNotes"]');
        return null;
      }

      function applySpannrahmenChoiceLock(itemEl, sourceField) {
        const positionEl = itemEl.querySelector('[data-field="spannPosition"]');
        const federEl = itemEl.querySelector('[data-field="spannFederstifte"]');
        const hakenEl = itemEl.querySelector('[data-field="spannHakenLengthMm"]');
        const brushPosEl = itemEl.querySelector('[data-field="spannBrushPosition"]');
        if (!positionEl || !federEl || !hakenEl) return;

        if (sourceField === 'spannPosition' && normalize(positionEl.value)) {
          federEl.value = '';
          const pos = normalize(positionEl.value).toLowerCase();
          if (brushPosEl) {
            if (pos === 'innenliegend') {
              brushPosEl.value = 'zum Fenster';
            } else if (pos === 'außenliegend' || pos === 'aussenliegend') {
              brushPosEl.value = 'Abdichtung nach unten';
            }
          }
        }
        if (sourceField === 'spannFederstifte' && normalize(federEl.value).toLowerCase() === 'ja') {
          hakenEl.value = '';
        }

        const hasPosition = !!normalize(positionEl.value);
        const usesFederstifte = normalize(federEl.value).toLowerCase() === 'ja';

        positionEl.disabled = usesFederstifte;
        federEl.disabled = hasPosition;
        hakenEl.disabled = usesFederstifte;
        if (!usesFederstifte && !normalize(hakenEl.value)) {
          hakenEl.value = '4';
        }
      }

      function applyInsectLogic(itemEl, sourceField) {
        const isInsect = isInsectType(itemEl.querySelector('[data-field="type"]')?.value);
        const hintEl = itemEl.querySelector('[data-block="insectSpecialColorHint"]');
        const colorEl = itemEl.querySelector('[data-field="insectColor"]');
        const notesEl = getInsectNotesField(itemEl);
        const isSpecialColor = isInsect && normalize(colorEl?.value) === SPECIAL_INSECT_COLOR;

        if (hintEl) hintEl.classList.toggle('hidden', !isSpecialColor);
        if (notesEl) {
          if (!notesEl.dataset.basePlaceholder) notesEl.dataset.basePlaceholder = notesEl.getAttribute('placeholder') || 'optional';
          notesEl.setAttribute(
            'placeholder',
            isSpecialColor
              ? 'Bitte Sonderfarbe mit RAL angeben, z. B. RAL 7016'
              : notesEl.dataset.basePlaceholder
          );
        }

        applySpannrahmenChoiceLock(itemEl, sourceField);
      }

      function addItem(cloneFromEl) {
        const node = itemTpl.content.firstElementChild.cloneNode(true);
        const idx = itemsEl.children.length;

        const uid = String(Date.now()) + '_' + String(Math.random()).slice(2);
        node.querySelectorAll('input[data-field="material"]').forEach((r) => {
          r.name = 'material_' + uid;
        });
        node.querySelectorAll('input[data-field="profileCode"]').forEach((r) => {
          r.name = 'profile_' + uid;
        });
        const pairs = [
          ['m-alu', 'material_alu'],
          ['m-pvc', 'material_pvc'],
          ['p-mini', 'profile_mini'],
          ['p-midi', 'profile_midi'],
          ['p-maxi', 'profile_maxi'],
          ['p-other', 'profile_other'],
        ];
        pairs.forEach(([oldId, suffix]) => {
          const input = node.querySelector('#' + oldId);
          const label = node.querySelector('label[for="' + oldId + '"]');
          if (!input || !label) return;
          const nextId = oldId + '_' + uid + '_' + suffix;
          input.id = nextId;
          label.setAttribute('for', nextId);
        });

        const typeSelect = node.querySelector('[data-field="type"]');
        typeSelect.innerHTML = '';
        itemTypeList.forEach(t => {
          const o = document.createElement('option');
          o.value = t;
          o.textContent = t;
          typeSelect.appendChild(o);
        });
        typeSelect.value = 'Rollladenpanzer';

        itemsEl.appendChild(node);
        updateItemTitle(node, idx);

        node.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-action]');
          if (!btn) return;
          const action = btn.getAttribute('data-action');
          if (action === 'remove') {
            node.remove();
            Array.from(itemsEl.children).forEach(updateItemTitle);
          } else if (action === 'duplicate') {
            addItem(node);
          }
        });

        node.querySelector('[data-field="type"]').addEventListener('change', () => {
          updatePanzerVisibility(node);
          updateTypeDependentVisibility(node);
        });
        node.querySelector('[data-field="insectSubtype"]').addEventListener('change', () => {
          updateTypeDependentVisibility(node);
        });
        node.querySelector('[data-field="insectColor"]').addEventListener('change', () => {
          applyInsectLogic(node);
        });
        node.querySelector('[data-field="spannPosition"]').addEventListener('change', () => {
          applyInsectLogic(node, 'spannPosition');
        });
        node.querySelector('[data-field="spannFederstifte"]').addEventListener('change', () => {
          applyInsectLogic(node, 'spannFederstifte');
        });
        node.querySelector('[data-field="doorKind"]').addEventListener('change', () => {
          updateTypeDependentVisibility(node);
        });
        node.querySelector('[data-field="endleisteEnabled"]').addEventListener('change', () => {
          applyPanzerLogic(node);
        });

        const rerunVorsatzLogic = () => applyVorsatzElementLogic(node, { keepBoxSize: true });
        const vorsatzFields = [
          'vorsatzElementDimensions', 'vorsatzBoxColorId', 'vorsatzBoxSizeMm', 'vorsatzShaftId',
          'vorsatzPanzerProfileId', 'vorsatzPanzerColorId',
          'vorsatzEndleisteEnabled', 'vorsatzEndleisteHoles', 'vorsatzEndleisteColorId',
          'vorsatzRollSide', 'vorsatzRailLengthMm',
          'vorsatzStrapSize', 'vorsatzStrapExit', 'vorsatzMotorExit', 'vorsatzOperatingSide'
        ];
        vorsatzFields.forEach(key => {
          const el = node.querySelector('[data-field="' + key + '"]');
          if (!el) return;
          const ev = (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) ? 'change' :
            (el.tagName === 'SELECT' ? 'change' : 'input');
          el.addEventListener(ev, rerunVorsatzLogic);
        });
        node.querySelectorAll('input[data-field="vorsatzElementRails"]').forEach(r => {
          r.name = 'vorsatzElementRails_' + uid;
          r.addEventListener('change', rerunVorsatzLogic);
        });
        node.querySelectorAll('input[data-field="vorsatzControl"]').forEach((r, idx) => {
          r.name = 'vorsatzControl_' + uid;
          r.id = r.id || ('vctrl_' + uid + '_' + idx);
          const lbl = r.nextElementSibling;
          if (lbl && lbl.tagName === 'LABEL' && !lbl.getAttribute('for')) lbl.setAttribute('for', r.id);
          r.addEventListener('change', rerunVorsatzLogic);
        });
        node.querySelectorAll('input[data-field="vorsatzPanzerMaterial"]').forEach((r, idx) => {
          r.name = 'vorsatzPanzerMaterial_' + uid;
          r.id = r.id || ('vpm_' + uid + '_' + idx);
          const lbl = r.nextElementSibling;
          if (lbl && lbl.tagName === 'LABEL' && !lbl.getAttribute('for')) lbl.setAttribute('for', r.id);
          r.addEventListener('change', rerunVorsatzLogic);
        });

        const rerunVorsatzBoxOnlyLogic = () => applyVorsatzBoxOnlyLogic(node, { keepBoxSize: true });
        const boxOnlyFields = [
          'boxOnlyBoxWidthMm', 'boxOnlyBoxColorId', 'boxOnlyBoxSizeMm', 'boxOnlyRollSide',
          'boxOnlyRailLengthMm',
          'boxOnlyStrapSize', 'boxOnlyStrapExit', 'boxOnlyMotorExit', 'boxOnlyOperatingSide'
        ];
        boxOnlyFields.forEach(key => {
          const el = node.querySelector('[data-field="' + key + '"]');
          if (!el) return;
          const ev = (el.tagName === 'INPUT' && el.type === 'radio') ? 'change' :
            (el.tagName === 'SELECT' ? 'change' : 'input');
          el.addEventListener(ev, rerunVorsatzBoxOnlyLogic);
        });
        node.querySelectorAll('input[data-field="boxOnlyRails"]').forEach(r => {
          r.name = 'boxOnlyRails_' + uid;
          r.addEventListener('change', rerunVorsatzBoxOnlyLogic);
        });
        node.querySelectorAll('input[data-field="boxOnlyControl"]').forEach((r, idx) => {
          r.name = 'boxOnlyControl_' + uid;
          r.id = r.id || ('bctrl_' + uid + '_' + idx);
          const lbl = r.nextElementSibling;
          if (lbl && lbl.tagName === 'LABEL' && !lbl.getAttribute('for')) lbl.setAttribute('for', r.id);
          r.addEventListener('change', rerunVorsatzBoxOnlyLogic);
        });

        if (cloneFromEl) {
          Array.from(cloneFromEl.querySelectorAll('[data-field]')).forEach(src => {
            const key = src.getAttribute('data-field');
            const dst = node.querySelector('[data-field="' + key + '"]');
            if (!dst) return;
            if (src.matches('input[type="radio"]')) return;
            if (src.matches('input[type="checkbox"]')) {
              dst.checked = !!src.checked;
              return;
            }
            dst.value = src.value;
          });

          const srcMaterial = cloneFromEl.querySelector('input[data-field="material"]:checked');
          const dstMaterial = srcMaterial ? node.querySelector('input[data-field="material"][value="' + srcMaterial.value + '"]') : null;
          if (dstMaterial) dstMaterial.checked = true;

          const srcProfile = cloneFromEl.querySelector('input[data-field="profileCode"]:checked');
          const dstProfile = srcProfile ? node.querySelector('input[data-field="profileCode"][value="' + srcProfile.value + '"]') : null;
          if (dstProfile) dstProfile.checked = true;

          const srcVPanzerMaterial = cloneFromEl.querySelector('input[data-field="vorsatzPanzerMaterial"]:checked');
          const dstVPanzerMaterial = srcVPanzerMaterial ? node.querySelector('input[data-field="vorsatzPanzerMaterial"][value="' + srcVPanzerMaterial.value + '"]') : null;
          if (dstVPanzerMaterial) dstVPanzerMaterial.checked = true;

          const srcVControl = cloneFromEl.querySelector('input[data-field="vorsatzControl"]:checked');
          node.querySelectorAll('input[data-field="vorsatzControl"]').forEach((c) => {
            if (srcVControl && srcVControl.value === c.value) c.dataset.wanted = c.value;
          });

          const srcBoxOnlyControl = cloneFromEl.querySelector('input[data-field="boxOnlyControl"]:checked');
          node.querySelectorAll('input[data-field="boxOnlyControl"]').forEach((c) => {
            if (srcBoxOnlyControl && srcBoxOnlyControl.value === c.value) c.dataset.wanted = c.value;
          });

          const srcEndEnabled = cloneFromEl.querySelector('[data-field="endleisteEnabled"]');
          const dstEndEnabled = node.querySelector('[data-field="endleisteEnabled"]');
          if (srcEndEnabled && dstEndEnabled) dstEndEnabled.checked = !!srcEndEnabled.checked;

          const srcEndHoles = cloneFromEl.querySelector('[data-field="endleisteHoles"]');
          const dstEndHoles = node.querySelector('[data-field="endleisteHoles"]');
          if (srcEndHoles && dstEndHoles) dstEndHoles.checked = !!srcEndHoles.checked;

          const srcColorId = normalize(cloneFromEl.querySelector('[data-field="colorId"]')?.value);
          if (srcColorId) node.querySelector('[data-field="colorId"]').dataset.wanted = srcColorId;

          const srcEndColorId = normalize(cloneFromEl.querySelector('[data-field="endleisteColorId"]')?.value);
          if (srcEndColorId) node.querySelector('[data-field="endleisteColorId"]').dataset.wanted = srcEndColorId;

          const srcVBoxColorId = normalize(cloneFromEl.querySelector('[data-field="vorsatzBoxColorId"]')?.value);
          if (srcVBoxColorId) node.querySelector('[data-field="vorsatzBoxColorId"]').dataset.wanted = srcVBoxColorId;

          const srcVPanzerColorId = normalize(cloneFromEl.querySelector('[data-field="vorsatzPanzerColorId"]')?.value);
          if (srcVPanzerColorId) node.querySelector('[data-field="vorsatzPanzerColorId"]').dataset.wanted = srcVPanzerColorId;

          const srcVEndColorId = normalize(cloneFromEl.querySelector('[data-field="vorsatzEndleisteColorId"]')?.value);
          if (srcVEndColorId) node.querySelector('[data-field="vorsatzEndleisteColorId"]').dataset.wanted = srcVEndColorId;

          const srcVPanzerProfileId = normalize(cloneFromEl.querySelector('[data-field="vorsatzPanzerProfileId"]')?.value);
          if (srcVPanzerProfileId) node.querySelector('[data-field="vorsatzPanzerProfileId"]').dataset.wanted = srcVPanzerProfileId;

          const srcVShaftId = normalize(cloneFromEl.querySelector('[data-field="vorsatzShaftId"]')?.value);
          if (srcVShaftId) node.querySelector('[data-field="vorsatzShaftId"]').dataset.wanted = srcVShaftId;

          const srcVBoxSize = normalize(cloneFromEl.querySelector('[data-field="vorsatzBoxSizeMm"]')?.value);
          if (srcVBoxSize) node.querySelector('[data-field="vorsatzBoxSizeMm"]').dataset.wanted = srcVBoxSize;

          const srcVRollSide = normalize(cloneFromEl.querySelector('[data-field="vorsatzRollSide"]')?.value);
          if (srcVRollSide) node.querySelector('[data-field="vorsatzRollSide"]').dataset.wanted = srcVRollSide;

          const srcVOperatingSide = normalize(cloneFromEl.querySelector('[data-field="vorsatzOperatingSide"]')?.value);
          if (srcVOperatingSide) node.querySelector('[data-field="vorsatzOperatingSide"]').dataset.wanted = srcVOperatingSide;

          const srcVStrapSize = normalize(cloneFromEl.querySelector('[data-field="vorsatzStrapSize"]')?.value);
          if (srcVStrapSize) node.querySelector('[data-field="vorsatzStrapSize"]').dataset.wanted = srcVStrapSize;

          const srcVStrapExit = normalize(cloneFromEl.querySelector('[data-field="vorsatzStrapExit"]')?.value);
          if (srcVStrapExit) node.querySelector('[data-field="vorsatzStrapExit"]').dataset.wanted = srcVStrapExit;

          const srcVMotorExit = normalize(cloneFromEl.querySelector('[data-field="vorsatzMotorExit"]')?.value);
          if (srcVMotorExit) node.querySelector('[data-field="vorsatzMotorExit"]').dataset.wanted = srcVMotorExit;

          const srcVRailLength = normalize(cloneFromEl.querySelector('[data-field="vorsatzRailLengthMm"]')?.value);
          if (srcVRailLength) node.querySelector('[data-field="vorsatzRailLengthMm"]').dataset.wanted = srcVRailLength;

          const srcVElementRails = cloneFromEl.querySelector('input[data-field="vorsatzElementRails"]:checked');
          const dstVElementRails = srcVElementRails ? node.querySelector('input[data-field="vorsatzElementRails"][value="' + srcVElementRails.value + '"]') : null;
          if (dstVElementRails) dstVElementRails.checked = true;

          const srcBoxOnlyBoxWidth = normalize(cloneFromEl.querySelector('[data-field="boxOnlyBoxWidthMm"]')?.value);
          if (srcBoxOnlyBoxWidth) node.querySelector('[data-field="boxOnlyBoxWidthMm"]').dataset.wanted = srcBoxOnlyBoxWidth;

          const srcBoxOnlyBoxColorId = normalize(cloneFromEl.querySelector('[data-field="boxOnlyBoxColorId"]')?.value);
          if (srcBoxOnlyBoxColorId) node.querySelector('[data-field="boxOnlyBoxColorId"]').dataset.wanted = srcBoxOnlyBoxColorId;

          const srcBoxOnlyBoxSize = normalize(cloneFromEl.querySelector('[data-field="boxOnlyBoxSizeMm"]')?.value);
          if (srcBoxOnlyBoxSize) node.querySelector('[data-field="boxOnlyBoxSizeMm"]').dataset.wanted = srcBoxOnlyBoxSize;

          const srcBoxOnlyRollSide = normalize(cloneFromEl.querySelector('[data-field="boxOnlyRollSide"]')?.value);
          if (srcBoxOnlyRollSide) node.querySelector('[data-field="boxOnlyRollSide"]').dataset.wanted = srcBoxOnlyRollSide;

          const srcBoxOnlyOperatingSide = normalize(cloneFromEl.querySelector('[data-field="boxOnlyOperatingSide"]')?.value);
          if (srcBoxOnlyOperatingSide) node.querySelector('[data-field="boxOnlyOperatingSide"]').dataset.wanted = srcBoxOnlyOperatingSide;

          const srcBoxOnlyStrapSize = normalize(cloneFromEl.querySelector('[data-field="boxOnlyStrapSize"]')?.value);
          if (srcBoxOnlyStrapSize) node.querySelector('[data-field="boxOnlyStrapSize"]').dataset.wanted = srcBoxOnlyStrapSize;

          const srcBoxOnlyStrapExit = normalize(cloneFromEl.querySelector('[data-field="boxOnlyStrapExit"]')?.value);
          if (srcBoxOnlyStrapExit) node.querySelector('[data-field="boxOnlyStrapExit"]').dataset.wanted = srcBoxOnlyStrapExit;

          const srcBoxOnlyMotorExit = normalize(cloneFromEl.querySelector('[data-field="boxOnlyMotorExit"]')?.value);
          if (srcBoxOnlyMotorExit) node.querySelector('[data-field="boxOnlyMotorExit"]').dataset.wanted = srcBoxOnlyMotorExit;

          const srcBoxOnlyRailLength = normalize(cloneFromEl.querySelector('[data-field="boxOnlyRailLengthMm"]')?.value);
          if (srcBoxOnlyRailLength) node.querySelector('[data-field="boxOnlyRailLengthMm"]').dataset.wanted = srcBoxOnlyRailLength;

          const srcBoxOnlyRails = cloneFromEl.querySelector('input[data-field="boxOnlyRails"]:checked');
          const dstBoxOnlyRails = srcBoxOnlyRails ? node.querySelector('input[data-field="boxOnlyRails"][value="' + srcBoxOnlyRails.value + '"]') : null;
          if (dstBoxOnlyRails) dstBoxOnlyRails.checked = true;

          const srcInsectColor = normalize(cloneFromEl.querySelector('[data-field="insectColor"]')?.value);
          const dstInsectColor = node.querySelector('[data-field="insectColor"]');
          if (srcInsectColor && dstInsectColor && !Array.from(dstInsectColor.options).some(o => o.value === srcInsectColor)) {
            dstInsectColor.value = SPECIAL_INSECT_COLOR;
            const notesEl = getInsectNotesField(node);
            if (notesEl && !normalize(notesEl.value)) notesEl.value = 'Sonderfarbe / RAL: ' + srcInsectColor;
          }
        }

        node.querySelectorAll('input[data-field="material"], input[data-field="profileCode"]').forEach(r => {
          r.addEventListener('change', () => applyPanzerLogic(node));
        });

        updateTypeDependentVisibility(node);
        updatePanzerVisibility(node);
      }

      addItem();

      addItemBtn.addEventListener('click', () => {
        const last = itemsEl.lastElementChild;
        addItem(last || null);
      });

      function setBusinessVisibility() {
        const isBusiness = document.getElementById('ct-business').checked;
        document.getElementById('private-extra').classList.toggle('hidden', isBusiness);
        if (isBusiness) {
          document.getElementById('phone').value = '';
          document.getElementById('email').value = '';
          document.getElementById('zip').value = '';
        }
      }

      document.getElementById('ct-private').addEventListener('change', setBusinessVisibility);
      document.getElementById('ct-business').addEventListener('change', setBusinessVisibility);
      setBusinessVisibility();

      function parseIntSafe(v) {
        const n = Number.parseInt(String(v ?? ''), 10);
        return Number.isFinite(n) ? n : null;
      }

      function startOfToday() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      }

      function isoFromDate(d) {
        const yyyy = String(d.getFullYear());
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
      }

      function dateFromIso(iso) {
        const s = normalize(iso);
        const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(s);
        if (!m) return null;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (!Number.isFinite(d.getTime())) return null;
        d.setHours(0, 0, 0, 0);
        return d;
      }

      function formatDateDe(d) {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = String(d.getFullYear());
        return dd + '.' + mm + '.' + yyyy;
      }

      function nextMonday(fromDate) {
        const d = new Date(fromDate.getTime());
        const day = d.getDay(); // 0..6 (Sun..Sat)
        const daysUntilMon = (1 - day + 7) % 7;
        d.setDate(d.getDate() + daysUntilMon);
        d.setHours(0, 0, 0, 0);
        return d;
      }

      function addDays(d, n) {
        const x = new Date(d.getTime());
        x.setDate(x.getDate() + n);
        x.setHours(0, 0, 0, 0);
        return x;
      }

      function computeDueDate(montageDate) {
        const today = startOfToday();
        const oneWeekBefore = addDays(montageDate, -7);
        return oneWeekBefore.getTime() < today.getTime() ? today : oneWeekBefore;
      }

      const montageDisplayEl = document.getElementById('montageDisplay');
      const calendarEl = document.getElementById('calendar');
      const montageIsoEl = document.getElementById('date');
      const dueIsoEl = document.getElementById('dueDate');
      const createdIsoEl = document.getElementById('createdDate');

      const createdToday = startOfToday();
      createdIsoEl.value = isoFromDate(createdToday);

      let selectedMontage = nextMonday(createdToday);
      let viewMonth = new Date(selectedMontage.getFullYear(), selectedMontage.getMonth(), 1);

      function currentMode() {
        return document.getElementById('mode-question')?.checked ? 'question' : 'order';
      }

      function setMontageDate(d) {
        if (!d) {
          selectedMontage = null;
          montageIsoEl.value = '';
          dueIsoEl.value = '';
          montageDisplayEl.textContent = '—';
          return;
        }

        selectedMontage = new Date(d.getTime());
        selectedMontage.setHours(0, 0, 0, 0);
        montageIsoEl.value = isoFromDate(selectedMontage);
        montageDisplayEl.textContent = formatDateDe(selectedMontage);

        const mode = currentMode();
        const due = mode === 'question' ? selectedMontage : computeDueDate(selectedMontage);
        dueIsoEl.value = due ? isoFromDate(due) : '';
      }

      function monthLabel(d) {
        const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
        return months[d.getMonth()] + ' ' + d.getFullYear();
      }

      function renderCalendar() {
        const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
        const last = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
        const firstDow = (first.getDay() + 6) % 7; // Monday=0

        const head = document.createElement('div');
        head.className = 'cal-head';

        const prev = document.createElement('button');
        prev.type = 'button';
        prev.className = 'btn';
        prev.textContent = '←';
        prev.addEventListener('click', () => {
          viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
          renderCalendar();
        });

        const title = document.createElement('div');
        title.className = 'cal-title';
        title.textContent = monthLabel(viewMonth);

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'btn';
        next.textContent = '→';
        next.addEventListener('click', () => {
          viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
          renderCalendar();
        });

        head.appendChild(prev);
        head.appendChild(title);
        head.appendChild(next);

        const grid = document.createElement('div');
        grid.className = 'cal-grid';

        ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(x => {
          const el = document.createElement('div');
          el.className = 'cal-dow';
          el.textContent = x;
          grid.appendChild(el);
        });

        for (let i = 0; i < firstDow; i += 1) {
          const sp = document.createElement('div');
          sp.className = 'cal-spacer';
          grid.appendChild(sp);
        }

        for (let day = 1; day <= last.getDate(); day += 1) {
          const d = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
          d.setHours(0, 0, 0, 0);
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cal-day';
          b.textContent = String(day);
          const selIso = selectedMontage ? isoFromDate(selectedMontage) : '';
          const curIso = isoFromDate(d);
          if (curIso === selIso) b.classList.add('sel');
          b.addEventListener('click', () => {
            setMontageDate(d);
            renderCalendar();
          });
          grid.appendChild(b);
        }

        calendarEl.innerHTML = '';
        calendarEl.appendChild(head);
        calendarEl.appendChild(grid);
      }

      setMontageDate(selectedMontage);
      renderCalendar();

      const orderItemsBlock = document.getElementById('order-items-block');
      const orderNotesBlock = document.getElementById('order-notes-block');
      const questionBlock = document.getElementById('question-block');
      const questionSearchBlock = document.getElementById('question-search-block');
      const questionTextBlock = document.getElementById('question-text-block');
      const emergencyBoxEl = document.getElementById('emergencyBox');
      const emergencyStateEl = document.getElementById('emergencyState');
      const emergencyToggleBtn = document.getElementById('emergencyToggleBtn');
      const calendarLabelEl = document.getElementById('calendarLabel');
      const clearDateBtn = document.getElementById('clearDateBtn');
      const orderRefLabelEl = document.getElementById('orderRefLabel');
      const historySearchEl = document.getElementById('historySearch');
      const historyResultsEl = document.getElementById('historyResults');
      let historyTimer = null;
      let emergencyActive = false;

      function renderEmergencyUi() {
        if (emergencyBoxEl) emergencyBoxEl.classList.toggle('active', emergencyActive);
        if (emergencyToggleBtn) {
          emergencyToggleBtn.classList.toggle('active', emergencyActive);
          emergencyToggleBtn.setAttribute('aria-pressed', emergencyActive ? 'true' : 'false');
          emergencyToggleBtn.textContent = emergencyActive ? 'Notfall deaktivieren' : 'Notfall aktivieren';
        }
        if (emergencyStateEl) emergencyStateEl.textContent = emergencyActive ? 'AKTIV' : 'AUS';
      }

      function applyModeUi() {
        const mode = currentMode();
        const isQuestion = mode === 'question';
        if (calendarLabelEl) calendarLabelEl.textContent = isQuestion ? 'Dringlichkeit (optional)' : 'Montagetermin';
        if (orderRefLabelEl) orderRefLabelEl.textContent = isQuestion ? 'Referenz' : 'Auftragsreferenz';
        if (clearDateBtn) clearDateBtn.classList.toggle('hidden', !isQuestion);
        if (orderItemsBlock) orderItemsBlock.classList.toggle('hidden', isQuestion);
        if (orderNotesBlock) orderNotesBlock.classList.toggle('hidden', isQuestion);
        if (questionBlock) questionBlock.classList.toggle('hidden', !isQuestion);
        if (questionSearchBlock) questionSearchBlock.classList.toggle('hidden', !isQuestion);
        if (questionTextBlock) questionTextBlock.classList.toggle('hidden', !isQuestion);
        if (emergencyBoxEl) emergencyBoxEl.classList.toggle('hidden', isQuestion);

        if (isQuestion) {
          emergencyActive = false;
          renderEmergencyUi();
          if (selectedMontage) setMontageDate(selectedMontage);
          else setMontageDate(null);
          renderCalendar();
        } else {
          if (!selectedMontage) {
            const now = startOfToday();
            viewMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            setMontageDate(nextMonday(now));
            renderCalendar();
          }
        }
      }

      document.getElementById('mode-order').addEventListener('change', applyModeUi);
      document.getElementById('mode-question').addEventListener('change', applyModeUi);
      if (emergencyToggleBtn) {
        emergencyToggleBtn.addEventListener('click', () => {
          emergencyActive = !emergencyActive;
          renderEmergencyUi();
        });
      }
      if (clearDateBtn) {
        clearDateBtn.addEventListener('click', () => {
          setMontageDate(null);
          renderCalendar();
        });
      }

      (async () => {
        try {
          const res = await fetch('/api/monitor-auth/users').then(r => r.json()).catch(() => null);
          const users = res && res.ok && Array.isArray(res.users) ? res.users : [];
          const sel = document.getElementById('assignee');
          if (!sel) return;
          users.forEach(u => {
            const code = normalize(u && u.code);
            const name = normalize(u && u.name);
            if (!code || !name) return;
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = code + ' – ' + name;
            sel.appendChild(opt);
          });
        } catch (e) {}
      })();

      function clearHistoryResults() {
        if (!historyResultsEl) return;
        historyResultsEl.innerHTML = '';
      }

      function renderHistoryResults(items) {
        if (!historyResultsEl) return;
        historyResultsEl.innerHTML = '';
        const list = Array.isArray(items) ? items : [];
        if (!list.length) {
          historyResultsEl.appendChild(el('div', { class: 'muted' }, [text('Keine Treffer.')])); 
          return;
        }
        list.slice(0, 12).forEach(it => {
          const id = normalize(it && it.id);
          const title = normalize(it && it.title);
          const due = normalize(it && it.dueDate);
          const url = normalize(it && it.url);
          const excerpt = normalize(it && it.excerpt);
          const code = id ? ('rwjob:' + id) : '';
          const openHref = code ? ('/display?code=' + encodeURIComponent(code)) : '';

          const row = el('div', { class: 'item' }, [
            el('div', { class: 'item-head' }, [
              el('div', { class: 'item-title' }, [text(title || id || 'Treffer')]),
              el('div', { class: 'row', style: 'flex:0 0 auto;' }, [
                el('button', { class: 'btn', type: 'button' }, [text('Übernehmen')]),
                openHref ? el('a', { class: 'btn', href: openHref, target: '_blank', rel: 'noopener' }, [text('Öffnen')]) : el('span'),
              ])
            ]),
            due ? el('div', { class: 'muted' }, [text('Fällig/Dringlichkeit: ' + due)]) : el('span'),
            excerpt ? el('div', { class: 'muted' }, [text(excerpt)]) : el('span'),
            url ? el('div', { class: 'muted' }, [text(url)]) : el('span'),
          ]);
          const btn = row.querySelector('button');
          btn.addEventListener('click', () => {
            try { document.getElementById('questionRef').value = title || id; } catch (e) {}
            try { if (url) document.getElementById('questionUrl').value = url; } catch (e) {}
          });
          historyResultsEl.appendChild(row);
        });
      }

      async function runHistorySearch() {
        if (!historySearchEl) return;
        const q = normalize(historySearchEl.value);
        if (q.length < 3) { clearHistoryResults(); return; }
        clearHistoryResults();
        historyResultsEl.appendChild(el('div', { class: 'muted' }, [text('Suche…')]));
        try {
          const res = await fetch('/api/intake/search?q=' + encodeURIComponent(q)).then(r => r.json()).catch(() => null);
          const ok = !!(res && res.ok);
          const list = ok && Array.isArray(res.results) ? res.results : [];
          renderHistoryResults(list);
        } catch (e) {
          clearHistoryResults();
        }
      }

      if (historySearchEl) {
        historySearchEl.addEventListener('input', () => {
          if (historyTimer) clearTimeout(historyTimer);
          historyTimer = setTimeout(runHistorySearch, 450);
        });
      }

      function collectPayload() {
        const mode = currentMode();
        const customerType = document.getElementById('ct-business').checked ? 'business' : 'private';
        const payload = {
          customerType,
          recipient: mode === 'question' ? 'question' : 'production',
          date: mode === 'question' ? '' : normalize(document.getElementById('date').value),
          createdDate: normalize(document.getElementById('createdDate').value),
          dueDate: normalize(document.getElementById('dueDate').value),
          customer: {
            company: normalize(document.getElementById('company').value),
            name: normalize(document.getElementById('name').value),
            email: normalize(document.getElementById('email').value),
            phone: normalize(document.getElementById('phone').value),
            street: normalize(document.getElementById('street').value),
            zip: normalize(document.getElementById('zip').value),
            city: normalize(document.getElementById('city').value),
          },
          orderRef: mode === 'question' ? normalize(document.getElementById('questionRef').value) : normalize(document.getElementById('orderRef').value),
          notes: mode === 'question' ? '' : normalize(document.getElementById('notes').value),
          assignee: mode === 'question' ? normalize(document.getElementById('assignee').value) : '',
          question: mode === 'question' ? normalize(document.getElementById('questionText').value) : '',
          url: mode === 'question' ? normalize(document.getElementById('questionUrl').value) : '',
          emergency: mode === 'question' ? false : !!emergencyActive,
          items: []
        };

        if (mode === 'question') return payload;

        Array.from(itemsEl.children).forEach(itemEl => {
          const type = normalize(itemEl.querySelector('[data-field="type"]').value);
          const freeText = normalize(itemEl.querySelector('[data-field="freeText"]').value);

          const details = { freeText };
          const insectSubtype = normalize(itemEl.querySelector('[data-field="insectSubtype"]').value);
          if (insectSubtype) details.insectSubtype = insectSubtype;
          const partsVendor = normalize(itemEl.querySelector('[data-field="partsVendor"]').value);
          if (partsVendor) details.partsVendor = partsVendor;

          if (isInsectType(type)) {
            const w = normalize(itemEl.querySelector('[data-field="insectWidthMm"]')?.value);
            const h = normalize(itemEl.querySelector('[data-field="insectHeightMm"]')?.value);
            const color = normalize(itemEl.querySelector('[data-field="insectColor"]')?.value);
            const mesh = normalize(itemEl.querySelector('[data-field="insectMesh"]')?.value);
            if (w) details.insectWidthMm = w;
            if (h) details.insectHeightMm = h;
            if (color) details.insectColor = color;
            if (mesh) details.insectMesh = mesh;

            if (insectSubtype === 'Spannrahmen') {
              const position = normalize(itemEl.querySelector('[data-field="spannPosition"]')?.value);
              const feder = normalize(itemEl.querySelector('[data-field="spannFederstifte"]')?.value);
              const haken = normalize(itemEl.querySelector('[data-field="spannHakenLengthMm"]')?.value);
              const brushPosition = normalize(itemEl.querySelector('[data-field="spannBrushPosition"]')?.value);
              const brushLength = normalize(itemEl.querySelector('[data-field="spannBrushLengthMm"]')?.value);
              const stabilizationMode = normalize(itemEl.querySelector('[data-field="spannStabilizationMode"]')?.value);
              const notes = normalize(itemEl.querySelector('[data-field="spannNotes"]')?.value);
              if (position) details.spannPosition = position;
              if (feder) details.spannFederstifte = feder;
              if (haken) details.spannHakenLengthMm = haken;
              else if (normalize(feder).toLowerCase() !== 'ja') details.spannHakenLengthMm = '4';
              if (brushPosition) details.spannBrushPosition = brushPosition;
              if (brushLength) details.spannBrushLengthMm = brushLength;
              if (stabilizationMode) details.spannStabilizationMode = stabilizationMode;
              if (notes) details.spannNotes = notes;
            } else if (insectSubtype === 'Rollo') {
              const cassette = normalize(itemEl.querySelector('[data-field="rolloCassette"]')?.value);
              const fsAbschluss = normalize(itemEl.querySelector('[data-field="rolloFsAbschluss"]')?.value);
              const griff = normalize(itemEl.querySelector('[data-field="rolloGripSli"]')?.value);
              const stop = normalize(itemEl.querySelector('[data-field="rolloStopFromBottomMm"]')?.value);
              const mounting = normalize(itemEl.querySelector('[data-field="rolloMounting"]')?.value);
              const notes = normalize(itemEl.querySelector('[data-field="rolloNotes"]')?.value);
              if (cassette) details.rolloCassette = cassette;
              if (fsAbschluss) details.rolloFsAbschluss = fsAbschluss;
              if (griff) details.rolloGripSli = griff;
              if (stop) details.rolloStopFromBottomMm = stop;
              if (mounting) details.rolloMounting = mounting;
              if (notes) details.rolloNotes = notes;
            } else if (insectSubtype === 'Tür') {
              const kind = normalize(itemEl.querySelector('[data-field="doorKind"]')?.value);
              const kick = normalize(itemEl.querySelector('[data-field="doorKickplate"]')?.value);
              const pet = normalize(itemEl.querySelector('[data-field="doorPetFlap"]')?.value);
              const wings = normalize(itemEl.querySelector('[data-field="doorWingCount"]')?.value);
              const railTop = normalize(itemEl.querySelector('[data-field="doorRailTopMm"]')?.value);
              const railBottom = normalize(itemEl.querySelector('[data-field="doorRailBottomMm"]')?.value);
              const frameNotes = normalize(itemEl.querySelector('[data-field="doorFrameNotes"]')?.value);
              const notes = normalize(itemEl.querySelector('[data-field="doorNotes"]')?.value);
              if (kind) details.doorKind = kind;
              if (kick) details.doorKickplate = kick;
              if (pet) details.doorPetFlap = pet;
              if (wings) details.doorWingCount = wings;
              if (railTop) details.doorRailTopMm = railTop;
              if (railBottom) details.doorRailBottomMm = railBottom;
              if (frameNotes) details.doorFrameNotes = frameNotes;
              if (notes) details.doorNotes = notes;
            }
          }

          if (isPanzerType(type)) {
            const material = getSelectedRadioValue(itemEl, 'material') || 'alu';
            const profileCode = getSelectedRadioValue(itemEl, 'profileCode') || 'mini';
            const profileLabel =
              profileCode === 'mini' ? '37 / Mini' :
              profileCode === 'midi' ? '45 / Midi' :
              profileCode === 'maxi' ? '52 / Maxi' : 'Sonstige';

            const colorId = normalize(itemEl.querySelector('[data-field="colorId"]').value);
            const colors = getColorsFor(material, profileCode);
            const colorLabel = (colors.find(c => c.id === colorId) || {}).label || '';

            const dimensions = normalize(itemEl.querySelector('[data-field="dimensions"]').value);

            const endleisteEnabled = !!itemEl.querySelector('[data-field="endleisteEnabled"]').checked;
            const endleisteHoles = !!itemEl.querySelector('[data-field="endleisteHoles"]').checked;
            const endleisteColorId = normalize(itemEl.querySelector('[data-field="endleisteColorId"]').value) || 'silber_eloxiert';
            const endleisteColorLabel = (ENDLEISTE_COLORS.find(c => c.id === endleisteColorId) || {}).label || '';

            details.material = material;
            details.profile = profileCode;
            details.profileLabel = profileLabel;
            details.colorId = colorId;
            details.colorLabel = colorLabel;
            details.dimensions = dimensions;
            details.endleisteEnabled = endleisteEnabled;
            details.endleisteHoles = endleisteHoles;
            details.endleisteColorId = endleisteColorId;
            details.endleisteColorLabel = endleisteColorLabel;
          } else if (isVorsatzType(type)) {
            const dimsRaw = normalize(itemEl.querySelector('[data-field="vorsatzElementDimensions"]').value);
            const dims = parseDimensions(dimsRaw);
            const boxSizeMmRaw = normalize(itemEl.querySelector('[data-field="vorsatzBoxSizeMm"]').value);
            const boxSizeMm = Number(boxSizeMmRaw) || null;

            const boxColorId = normalize(itemEl.querySelector('[data-field="vorsatzBoxColorId"]').value);
            const boxColorLabel = (VORSATZ_COLORS.find(c => c.id === boxColorId) || {}).label || '';

            const shaftId = normalize(itemEl.querySelector('[data-field="vorsatzShaftId"]').value);
            const shaftLabel = (VORSATZ_SHAFT_OPTIONS.find(s => s.id === shaftId) || {}).label || '';

            const rails = normalize(getSelectedRadioValue(itemEl, 'vorsatzElementRails')) || 'nein';
            const railLengthMmRaw = normalize(itemEl.querySelector('[data-field="vorsatzRailLengthMm"]')?.value);
            const railLengthMm = Number(railLengthMmRaw) || null;

            const rollSide = normalize(itemEl.querySelector('[data-field="vorsatzRollSide"]')?.value);
            const rollSideLabel = (VORSATZ_BOX_SIDE_OPTIONS.find(o => o.id === rollSide) || {}).label || '';
            const operatingSide = normalize(itemEl.querySelector('[data-field="vorsatzOperatingSide"]')?.value);
            const operatingSideLabel = (VORSATZ_BOX_OPERATING_SIDE.find(o => o.id === operatingSide) || {}).label || '';
            const control = normalize(getSelectedRadioValue(itemEl, 'vorsatzControl')) || 'strap';
            const strapSize = normalize(itemEl.querySelector('[data-field="vorsatzStrapSize"]')?.value);
            const strapSizeLabel = (VORSATZ_STRAP_SIZES.find(o => o.id === strapSize) || {}).label || '';
            const strapExit = normalize(itemEl.querySelector('[data-field="vorsatzStrapExit"]')?.value);
            const strapExitLabel = (VORSATZ_STRAP_EXIT_OPTIONS.find(o => o.id === strapExit) || {}).label || '';
            const motorExit = normalize(itemEl.querySelector('[data-field="vorsatzMotorExit"]')?.value);
            const motorExitLabel = (VORSATZ_EXIT_OPTIONS.find(o => o.id === motorExit) || {}).label || '';

            details.vorsatzElementDims = dims ? (String(dims.width) + ' x ' + String(dims.height) + ' mm') : dimsRaw;
            details.vorsatzElementWidthMm = dims ? dims.width : null;
            details.vorsatzElementHeightMm = dims ? dims.height : null;
            details.vorsatzBoxSizeMm = boxSizeMm;
            details.vorsatzBoxColorId = boxColorId;
            details.vorsatzBoxColorLabel = boxColorLabel;
            details.vorsatzShaftId = shaftId;
            details.vorsatzShaftLabel = shaftLabel;
            details.vorsatzElementRails = rails;
            details.vorsatzRailLengthMm = railLengthMm;
            details.vorsatzRollSide = rollSide;
            details.vorsatzRollSideLabel = rollSideLabel;
            details.vorsatzOperatingSide = operatingSide;
            details.vorsatzOperatingSideLabel = operatingSideLabel;
            details.vorsatzControl = control;
            details.vorsatzStrapSize = strapSize;
            details.vorsatzStrapSizeLabel = strapSizeLabel;
            details.vorsatzStrapExit = strapExit;
            details.vorsatzStrapExitLabel = strapExitLabel;
            details.vorsatzMotorExit = motorExit;
            details.vorsatzMotorExitLabel = motorExitLabel;
            details.vorsatzPanzerEnabled = true;

            const panzerMaterial = getSelectedRadioValue(itemEl, 'vorsatzPanzerMaterial') || 'alu';
            const panzerProfileId = normalize(itemEl.querySelector('[data-field="vorsatzPanzerProfileId"]').value);
            const panzerProfileLabel = (VORSATZ_ROLLO_PROFILES.find(p => p.id === panzerProfileId) || {}).label || '';
            const panzerColorId = normalize(itemEl.querySelector('[data-field="vorsatzPanzerColorId"]').value);
            const panzerColorLabel = (VORSATZ_COLORS.find(c => c.id === panzerColorId) || {}).label || '';
            const endleisteEnabled = !!itemEl.querySelector('[data-field="vorsatzEndleisteEnabled"]').checked;
            const endleisteHoles = !!itemEl.querySelector('[data-field="vorsatzEndleisteHoles"]').checked;
            const endleisteColorId = normalize(itemEl.querySelector('[data-field="vorsatzEndleisteColorId"]').value) || 'silber_eloxiert';
            const endleisteColorLabel = (ENDLEISTE_COLORS.find(c => c.id === endleisteColorId) || {}).label || '';

            let panzerWidth = null;
            let panzerHeight = null;
            if (dims && boxSizeMm) {
              panzerWidth = Math.max(0, dims.width - 65);
              panzerHeight = Math.max(0, Math.round(dims.height - (boxSizeMm / 2)));
            }

            details.vorsatzPanzerMaterial = panzerMaterial;
            details.vorsatzPanzerProfileId = panzerProfileId;
            details.vorsatzPanzerProfileLabel = panzerProfileLabel;
            details.vorsatzPanzerColorId = panzerColorId;
            details.vorsatzPanzerColorLabel = panzerColorLabel;
            details.vorsatzPanzerEndleisteEnabled = endleisteEnabled;
            details.vorsatzPanzerEndleisteHoles = endleisteHoles;
            details.vorsatzPanzerEndleisteColorId = endleisteColorId;
            details.vorsatzPanzerEndleisteColorLabel = endleisteColorLabel;
            details.vorsatzPanzerDimensions = (panzerWidth && panzerHeight) ? (String(panzerWidth) + ' x ' + String(panzerHeight) + ' mm') : '';
            details.vorsatzPanzerWidthMm = panzerWidth;
            details.vorsatzPanzerHeightMm = panzerHeight;
          } else if (isVorsatzBoxOnlyType(type)) {
            const boxWidthMmRaw = normalize(itemEl.querySelector('[data-field="boxOnlyBoxWidthMm"]')?.value);
            const boxWidthMm = Number(boxWidthMmRaw) || null;
            const boxSizeMmRaw = normalize(itemEl.querySelector('[data-field="boxOnlyBoxSizeMm"]')?.value);
            const boxSizeMm = Number(boxSizeMmRaw) || null;
            const boxColorId = normalize(itemEl.querySelector('[data-field="boxOnlyBoxColorId"]')?.value);
            const boxColorLabel = (VORSATZ_COLORS.find(c => c.id === boxColorId) || {}).label || '';

            const rollSide = normalize(itemEl.querySelector('[data-field="boxOnlyRollSide"]')?.value);
            const rollSideLabel = (VORSATZ_BOX_SIDE_OPTIONS.find(o => o.id === rollSide) || {}).label || '';
            const operatingSide = normalize(itemEl.querySelector('[data-field="boxOnlyOperatingSide"]')?.value);
            const operatingSideLabel = (VORSATZ_BOX_OPERATING_SIDE.find(o => o.id === operatingSide) || {}).label || '';

            const rails = normalize(getSelectedRadioValue(itemEl, 'boxOnlyRails')) || 'nein';
            const railLengthMmRaw = normalize(itemEl.querySelector('[data-field="boxOnlyRailLengthMm"]')?.value);
            const railLengthMm = Number(railLengthMmRaw) || null;

            const control = normalize(getSelectedRadioValue(itemEl, 'boxOnlyControl')) || 'strap';
            const strapSize = normalize(itemEl.querySelector('[data-field="boxOnlyStrapSize"]')?.value);
            const strapSizeLabel = (VORSATZ_STRAP_SIZES.find(o => o.id === strapSize) || {}).label || '';
            const strapExit = normalize(itemEl.querySelector('[data-field="boxOnlyStrapExit"]')?.value);
            const strapExitLabel = (VORSATZ_STRAP_EXIT_OPTIONS.find(o => o.id === strapExit) || {}).label || '';
            const motorExit = normalize(itemEl.querySelector('[data-field="boxOnlyMotorExit"]')?.value);
            const motorExitLabel = (VORSATZ_EXIT_OPTIONS.find(o => o.id === motorExit) || {}).label || '';

            details.vorsatzBoxOnlyBoxWidthMm = boxWidthMm;
            details.vorsatzBoxOnlyBoxSizeMm = boxSizeMm;
            details.vorsatzBoxOnlyBoxColorId = boxColorId;
            details.vorsatzBoxOnlyBoxColorLabel = boxColorLabel;
            details.vorsatzBoxOnlyRollSide = rollSide;
            details.vorsatzBoxOnlyRollSideLabel = rollSideLabel;
            details.vorsatzBoxOnlyOperatingSide = operatingSide;
            details.vorsatzBoxOnlyOperatingSideLabel = operatingSideLabel;
            details.vorsatzBoxOnlyRails = rails;
            details.vorsatzBoxOnlyRailLengthMm = railLengthMm;
            details.vorsatzBoxOnlyControl = control;
            details.vorsatzBoxOnlyStrapSize = strapSize;
            details.vorsatzBoxOnlyStrapSizeLabel = strapSizeLabel;
            details.vorsatzBoxOnlyStrapExit = strapExit;
            details.vorsatzBoxOnlyStrapExitLabel = strapExitLabel;
            details.vorsatzBoxOnlyMotorExit = motorExit;
            details.vorsatzBoxOnlyMotorExitLabel = motorExitLabel;
          }

          payload.items.push({ type, details });
        });

        return payload;
      }

      function rememberFromPayload(payload) {
        const companies = loadList(STORAGE.companies, []);
        if (payload.customerType === 'business' && payload.customer && payload.customer.company) companies.unshift(payload.customer.company);
        saveList(STORAGE.companies, companies);
        fillDatalist('company-list', loadList(STORAGE.companies, []));
      }

      function resetFormAfterSend() {
        try {
          document.getElementById('company').value = '';
          document.getElementById('orderRef').value = '';
          document.getElementById('questionRef').value = '';
          document.getElementById('questionUrl').value = '';
          document.getElementById('questionText').value = '';
          document.getElementById('assignee').value = '';
          document.getElementById('name').value = '';
          document.getElementById('street').value = '';
          document.getElementById('city').value = '';
          document.getElementById('notes').value = '';
          document.getElementById('phone').value = '';
          document.getElementById('email').value = '';
          document.getElementById('zip').value = '';
          emergencyActive = false;
          renderEmergencyUi();
          if (historySearchEl) historySearchEl.value = '';
          clearHistoryResults();
        } catch (e) {}

        try {
          while (itemsEl.firstChild) itemsEl.removeChild(itemsEl.firstChild);
          addItem();
        } catch (e) {}

        try {
          const now = startOfToday();
          createdIsoEl.value = isoFromDate(now);
          viewMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          if (currentMode() === 'question') setMontageDate(null);
          else setMontageDate(nextMonday(now));
          renderCalendar();
        } catch (e) {}

        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
      }

      async function submit() {
        clearStatus();
        const payload = collectPayload();

        const mode = currentMode();
        if (mode === 'question') {
          if (!payload.assignee) {
            setStatus('err', 'Bitte Kürzel auswählen (Antwort von).');
            return;
          }
          if (!payload.question) {
            setStatus('err', 'Bitte Frage/Notiz eingeben.');
            return;
          }
        } else {
          if (!payload.date) {
            setStatus('err', 'Bitte Montagetermin auswählen.');
            return;
          }
          if (!payload.items.length) {
            setStatus('err', 'Mindestens eine Position ist erforderlich.');
            return;
          }
          const invalidSpannrahmen = (payload.items || []).find((it) => {
            const type = normalize(it && it.type).toLowerCase();
            const details = it && it.details && typeof it.details === 'object' ? it.details : {};
            if (type !== 'insektenschutz') return false;
            if (normalize(details.insectSubtype) !== 'Spannrahmen') return false;
            const width = normalize(details.insectWidthMm);
            const height = normalize(details.insectHeightMm);
            const color = normalize(details.insectColor);
            const mesh = normalize(details.insectMesh);
            const position = normalize(details.spannPosition);
            const feder = normalize(details.spannFederstifte).toLowerCase() === 'ja';
            const x = normalize(details.spannHakenLengthMm);
            const brushPosition = normalize(details.spannBrushPosition);
            const brushLength = normalize(details.spannBrushLengthMm);
            return !width || !height || !color || !mesh || (!position && !feder) || (!feder && !x) || !brushPosition || !brushLength;
          });
          if (invalidSpannrahmen) {
            setStatus('err', 'Für SP-B 35 bitte Breite, Höhe, Farbe, Gaze, Bürstenlage, Bürstenlänge und Lage oder Federstifte vollständig auswählen. Hakenmaß X ist nur bei Hakenbefestigung erforderlich.');
            return;
          }
          if (payload.emergency) {
            const ok = window.confirm('Notfall wirklich an Slack senden? Dabei wird zusätzlich eine Alarmnachricht für Push-Benachrichtigungen ausgelöst.');
            if (!ok) return;
          }
        }

        submitBtn.disabled = true;
        try {
          const url = mode === 'question' ? '/api/intake/question' : '/api/intake/order';
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
          });

          const ct = String(res.headers.get('content-type') || '').toLowerCase();
          const data = ct.includes('application/json')
            ? await res.json().catch(() => ({}))
            : {};
          if (!res.ok || !data.ok) {
            let msg = normalize(data.error || data.message || '');
            if (!msg) {
              try {
                const t = await res.text();
                const snip = normalize(String(t || '').slice(0, 220));
                if (snip) msg = snip;
              } catch (e) {}
            }
            const shown = msg ? msg : ('HTTP ' + String(res.status));
            setStatus('err', 'Fehler: <span class="mono">' + escapeHtml(shown) + '</span>');
            return;
          }

          rememberFromPayload(payload);
          const itemId = normalize(data.itemId);
          const ts = normalize(data.ts);
          const createdInfo = payload.createdDate ? formatDateDe(dateFromIso(payload.createdDate)) : '';
          const dueInfo = payload.dueDate ? formatDateDe(dateFromIso(payload.dueDate)) : '';
          const info = (createdInfo || dueInfo)
            ? ('<div class="muted" style="margin-top:6px;font-size:12px;">Erfasst: ' + createdInfo + (dueInfo ? (' · Dringlichkeit: ' + dueInfo) : '') + '</div>')
            : '';
          const hasRepair = (payload.items || []).some(it => normalize(it && it.type).toLowerCase() === 'reparatur');
          const montagePath = itemId ? ('/display/montagebericht?itemId=' + encodeURIComponent(itemId)) : '';
          const montageUrl = montagePath ? (new URL(montagePath, window.location.origin).toString()) : '';
          const montageBox = (mode !== 'question' && hasRepair && montageUrl)
            ? (
              '<div style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' +
                '<div class="muted">Montagebericht:</div>' +
                '<a class="mono" href="' + escapeHtml(montageUrl) + '" target="_blank" rel="noopener">' + escapeHtml(montageUrl) + '</a>' +
                '<button class="btn" type="button" id="openMontageLink">Öffnen</button>' +
                '<button class="btn" type="button" id="copyMontageLink">Link kopieren</button>' +
              '</div>'
            )
            : '';
          const emergencyInfo = payload.emergency
            ? '<div class="muted" style="margin-top:6px;font-size:12px;">Notfall-Alarm wurde zusätzlich an Slack gesendet.</div>'
            : '';
          setStatus('ok', 'Gesendet. ' + (itemId ? ('Item: <span class="mono">' + escapeHtml(itemId) + '</span>') : (ts ? ('Slack TS: <span class="mono">' + escapeHtml(ts) + '</span>') : '')) + info + emergencyInfo + montageBox);
          if (montageUrl) {
            const openBtn = document.getElementById('openMontageLink');
            if (openBtn) {
              openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                try { window.open(montageUrl, '_blank', 'noopener'); } catch (e2) {}
              });
            }
            const copyBtn = document.getElementById('copyMontageLink');
            if (copyBtn) {
              copyBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const old = copyBtn.textContent;
                const ok = await copyText(montageUrl);
                copyBtn.textContent = ok ? 'Kopiert' : 'Nicht kopiert';
                setTimeout(() => { copyBtn.textContent = old; }, 1200);
              });
            }
          }
          if (mode !== 'question' && itemId) {
            if (hasRepair) {
              const url = montagePath || ('/display/montagebericht?itemId=' + encodeURIComponent(itemId));
              try { window.open(url, '_blank', 'noopener'); } catch (e) {}
            }
          }
          resetFormAfterSend();
        } catch (e) {
          setStatus('err', 'Fehler: <span class="mono">' + normalize(e && e.message) + '</span>');
        } finally {
          submitBtn.disabled = false;
        }
      }

      submitBtn.addEventListener('click', submit);
      renderEmergencyUi();
      applyModeUi();
    </script>
  </body>
</html>`;
}

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.send(pageHtml());
});

module.exports = router;
