const fs = require('fs');

// ベースURLの定義
const BASE_API_URL = "https://w-tid.jp/tokyu";
const FILE_PATH = "./today_unyo.json";

async function fetchTrainLocation() {
  try {
    // 既存データの読み込み枠（初期化）
    let unyoData = { toyoko: {}, meguro: {}, lastUpdate: "" };
    
    // 日本時間（JST）の現在時刻を取得
    const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
    const todayStr = now.toISOString().split('T')[0]; 
    const timeStr = now.toISOString().split('T')[1].substring(0, 5); 

    if (fs.existsSync(FILE_PATH)) {
      try {
        const fileContent = fs.readFileSync(FILE_PATH, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed.date === todayStr) {
          unyoData = parsed;
        }
      } catch (e) {
        console.log("既存データ解析失敗のためリセットします");
      }
    }

    unyoData.date = todayStr;
    unyoData.lastUpdate = timeStr;

    // 対象路線の定義（キー名とファイル名を一致させる）
    const lines = ["toyoko", "meguro"];

    for (const lineKey of lines) {
      // toyokoのときは toyoko.json、meguroのときは meguro.json を取得
      const response = await fetch(`${BASE_API_URL}/${lineKey}.json`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const json = await response.json();
      
      // JSON内の「lines」オブジェクトから該当路線のデータを解析
      const linesData = json.lines || {};
      const lineObj = linesData[lineKey] || {};
      const trains = lineObj.trains || [];

      trains.forEach(train => {
        // 運用（op）と編成（form）がある場合のみ記録
        if (train.op && train.form) {
          const opNo = train.op;
          
          // 車両数・遅延・列車番号・行き先コードを取得
          const cars = train.cars || "8";
          const delayMin = train.delay ? `${train.delay}分遅れ` : "";
          const destCode = train.destCode !== undefined ? String(train.destCode) : "";

          unyoData[lineKey][opNo] = {
            op: opNo,
            form: train.form,
            cars: cars,
            no: train.no || "",
            destCode: destCode, // index.htmlのdestination_mapと紐付くコード
            delay: delayMin
          };
        }
      });
    }

    // データの保存
    fs.writeFileSync(FILE_PATH, JSON.stringify(unyoData, null, 2), 'utf8');
    console.log(`データ収集成功: ${timeStr}`);

  } catch (error) {
    console.error("エラーが発生しました:", error);
    process.exit(1);
  }
}

fetchTrainLocation();
