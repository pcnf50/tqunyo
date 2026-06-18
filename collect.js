const fs = require('fs');

const BASE_API_URL = "https://w-tid.jp/tokyu";
const FILE_PATH = "./today_unyo.json";
const TOKYU_JSON_URL = "https://nfhanyo.web.fc2.com/tokyu/tokyu_data.json";

const DEST_MAP = {
  "33":"副都心線直通","54":"三田線直通","67":"南北線直通","71":"目黒","73":"武蔵小山","76":"大岡山","77":"奥沢",
  "78":"渋谷","79":"代官山","80":"中目黒","81":"祐天寺","82":"学芸大学","83":"都立大学","84":"自由が丘",
  "85":"田園調布","86":"多摩川","87":"新丸子","88":"武蔵小杉","89":"元住吉","90":"日吉","91":"綱島",
  "92":"大倉山","93":"菊名","94":"妙蓮寺","95":"白楽","96":"東白楽","97":"反町","98":"横浜",
  "103":"元町・中華街","108":"新横浜","111":"相鉄線直通"
};

async function fetchTrainLocation() {
  try {
    let unyoData = {
      toyoko: {},
      meguro: {},
      lastUpdate: "",
      date: ""
    };

    const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = now.toISOString().split('T')[1].substring(0, 5);

    if (fs.existsSync(FILE_PATH)) {
      try {
        const fileContent = fs.readFileSync(FILE_PATH, 'utf8');
        const parsed = JSON.parse(fileContent);

        if (parsed && parsed.date === todayStr) {
          unyoData = parsed;
          delete unyoData.dento;
        }
      } catch (e) {
        console.log("既存データ解析失敗のためリセットします");
      }
    }

    unyoData.date = todayStr;
    unyoData.lastUpdate = timeStr;

    if (!unyoData.toyoko) unyoData.toyoko = {};
    if (!unyoData.meguro) unyoData.meguro = {};

    const tokyuRes = await fetch(
      TOKYU_JSON_URL,
      { cache: "no-store" }
    ).then(r => r.json()).catch(() => ({}));

    const toyokoFormationList =
      tokyuRes.lines?.["toyoko"]?.formations || [];

    const meguroFormationList =
      tokyuRes.lines?.["meguro"]?.formations || [];

    // 東横線
    try {
      const tyUrls = [
        `${BASE_API_URL}/toyoko.json`,
        `${BASE_API_URL}/shinyokohama.json`
      ];

      const tyTrainsAll = [];

      for (const url of tyUrls) {
        const r = await fetch(url, { cache: "no-store" })
          .then(res => res.json())
          .catch(() => ({ trains: [] }));

        tyTrainsAll.push(...(r.trains || []));
      }

      const tySeen = new Set();

      for (const t of tyTrainsAll) {
        if (!t || !t.train_number || t.train_number.length < 5 || tySeen.has(t.train_number)) continue;

        tySeen.add(t.train_number);

        if (["2","3","4","5","6"].includes(t.train_number[1])) continue;
        if ([54,67,71,73,76,77].includes(t.destination_station_code)) continue;

        let kind =
          t.kind === "普" ? "各駅停車" :
          t.kind === "急" ? "急行" :
          t.kind === "特" ? "特急" :
          t.kind === "通" ? "通勤特急" :
          (t.kind === "Ｆ" || t.kind === "F") ? "F特急" :
          t.kind === "Ｓ" ? "Ｓトレイン" :
          t.kind === "回" ? "回送" :
          "不明";

        let opDisp =
          t.train_number.slice(2,4) +
          ({
            "9":"G",
            "8":"T",
            "7":"S",
            "1":"M",
            "0":"K"
          }[t.train_number[1]] || "");

        if (kind === "不明") {
          opDisp = t.train_number.slice(2,4);
        }

        const fMatch = toyokoFormationList.find(
          f => f.label === `${t.num_of_cars}${t.affiliation}${t.train_orchestration_number}`
        );

        unyoData.toyoko[opDisp] = {
          op: opDisp,
          form: fMatch ? fMatch.formation : "-",
          cars: t.num_of_cars || "8",
          no: t.train_number.slice(1,4) + "-" + t.train_number.slice(4,7),
          destCode: DEST_MAP[String(t.destination_station_code)] || String(t.destination_station_code || ""),
          kind,
          delay: t.delay_time ? `${t.delay_time}分遅れ` : ""
        };
      }
    } catch (e) {
      console.error(e);
    }

    // 目黒線
    try {
      const mgUrls = [
        `${BASE_API_URL}/meguro.json`,
        `${BASE_API_URL}/shinyokohama.json`
      ];

      const mgTrainsAll = [];

      for (const url of mgUrls) {
        const r = await fetch(url, { cache: "no-store" })
          .then(res => res.json())
          .catch(() => ({ trains: [] }));

        mgTrainsAll.push(...(r.trains || []));
      }

      const mgSeen = new Set();

      for (const t of mgTrainsAll) {
        if (!t || !t.train_number || mgSeen.has(t.train_number)) continue;

        mgSeen.add(t.train_number);

        if (['0','7','9','8'].includes(t.train_number[1])) continue;

        const numberPart = t.train_number.slice(1).padStart(6, '0');
        const opStr = String(t.operation_number || "");

        const opDisp =
          opStr.slice(-2) +
          ({
            '6':'G',
            '5':'M',
            '4':'T',
            '3':'S',
            '2':'K',
            '0':'K'
          }[opStr[0]] || "");

        const fMatch = meguroFormationList.find(
          f => f.label === `${t.num_of_cars}${t.affiliation}${t.train_orchestration_number}`
        );

        unyoData.meguro[opDisp] = {
          op: opDisp,
          form: fMatch ? fMatch.formation : '-',
          cars: t.num_of_cars || "8",
          no: numberPart.slice(0,3) + '-' + numberPart.slice(3,6),
          destCode: DEST_MAP[String(t.destination_station_code)] || String(t.destination_station_code || ""),
          kind:
            t.kind === "普" ? "各駅停車" :
            t.kind === "急" ? "急行" :
            t.kind === "特" ? "特急" :
            t.kind === "通" ? "通勤特急" :
            (t.kind === "Ｆ" || t.kind === "F") ? "F特急" :
            t.kind === "回" ? "回送" :
            "各駅停車",
          delay: t.delay_time ? `${t.delay_time}分遅れ` : ""
        };
      }
    } catch (e) {
      console.error(e);
    }

    fs.writeFileSync(
      FILE_PATH,
      JSON.stringify(unyoData, null, 2),
      'utf8'
    );

  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

fetchTrainLocation();
