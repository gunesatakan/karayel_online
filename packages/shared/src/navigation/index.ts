/**
 * Kor gezinme.
 *
 * Dusmanlar haritanin tamamini bilmiyor. Cikisa dogru korlemesine yuruyorlar;
 * onlerine bir sey cikinca duvari tutup dolasiyorlar. Bu, en kisa yolu bulmaz --
 * amac da bu degil. Amac dusmanin bildigi kadarini kullanmasi.
 *
 * Bunun bilinen tuzagi sonsuz salinim: hafizasiz bir "sagi mi solu mu" karari
 * ayni hucrede hep ayni sonucu verir ve dusman iki kare arasinda gidip gelir.
 * Cozum karara iki sey eklemek:
 *
 *   1. Hangi ele tutundugu, ilk temasta secilir ve **sabit kalir**.
 *   2. Duvari tutmaya nerede baslandigi.
 *
 * Duvar ancak dusman **takildigi satirin altina inebilecegi** anda birakilir.
 * Bu, her dolasma turunun bir oncekinden daha asagida bittigi anlamina gelir;
 * satir sayisi sonlu oldugu icin salinim da sonlu olur.
 *
 * Once Pledge'in donus sayaci denendi ve tahtada calismadi: sayac sifira
 * dondugunde birakma kurali, sinirsiz duzlemde engeli dolasmayi garanti eder
 * ama harita kenarlari da kapali oldugu icin dusman kendi oyun alaninin
 * cevresini dolanip sayaci tam tura tasiyor ve gedigi gormeden "cikis yok"
 * diyordu.
 *
 * Kapali alan yine yerel olarak anlasiliyor: dusman duvari tutmaya basladigi
 * hucreden ayni yone ikinci kez cikmaya kalkiyorsa tam bir cevrim kapanmistir.
 * Grid yuruyusunde durum (hucre, yon) ciftinden ibaret oldugu icin bu kesin:
 * ayni cift ayni adimlari dogurur, yani o duvarin cevresinde asagi acilan
 * hicbir gedik yok. Dusman o an kirmaya baslar.
 *
 * Yalnizca hucreye bakmak yetmiyor -- dusman engeli dolasirken basladigi
 * hucreden baska bir yonle gecebilir ve gedik hala ilerideyken bosuna kirmaya
 * baslardi.
 */

/** 0 asagi, 1 sag, 2 yukari, 3 sol. Saat yonunde. */
export type BlindHeading = 0 | 1 | 2 | 3;

export const BLIND_DIRECTIONS: ReadonlyArray<{ col: number; row: number }> = [
  { col: 0, row: 1 },
  { col: 1, row: 0 },
  { col: 0, row: -1 },
  { col: -1, row: 0 }
];

/** Cikis asagida oldugu icin tercih yonu her zaman asagi. */
export const BLIND_PREFERRED_HEADING: BlindHeading = 0;

export type BlindHand = "left" | "right";

export type BlindNavigatorState = {
  mode: "seek" | "wall";
  hand: BlindHand;
  heading: BlindHeading;
  /** Duvari tutmaya baslanan hucre ve yon; cevrim tespiti bu ciftin tekrari. */
  entryCol: number;
  entryRow: number;
  entryHeading: BlindHeading;
};

export type BlindStepResult =
  | { kind: "move"; col: number; row: number; state: BlindNavigatorState }
  /** Yol kapali: verilen hucredeki engel kirilmali. */
  | { kind: "attack"; col: number; row: number; state: BlindNavigatorState };

export function createBlindNavigatorState(hand: BlindHand = "left"): BlindNavigatorState {
  return { mode: "seek", hand, heading: BLIND_PREFERRED_HEADING, entryCol: -1, entryRow: -1, entryHeading: BLIND_PREFERRED_HEADING };
}

function turn(heading: BlindHeading, delta: number): BlindHeading {
  return (((heading + delta) % 4) + 4) % 4 as BlindHeading;
}

function step(from: { col: number; row: number }, heading: BlindHeading) {
  const direction = BLIND_DIRECTIONS[heading];
  return { col: from.col + direction.col, row: from.row + direction.row };
}

/** Ekranda sola donus. Yon dizisi saat yonunun tersine siralandigi icin +1. */
function handTurn(hand: BlindHand) {
  return hand === "left" ? 1 : -1;
}

/**
 * Duvari tutarken denenecek yonler.
 *
 * Sol elle tutmak, once sola donmeyi denemek demek: duvar solda kalir ve
 * dusman ic koseyi kesmeden dolanir. Sag el bunun aynasi. Sira her zaman
 * "ele dogru, duz, ters ele, geri".
 */
function wallFollowOrder(heading: BlindHeading, hand: BlindHand): BlindHeading[] {
  const toHand = handTurn(hand);
  return [turn(heading, toHand), heading, turn(heading, -toHand), turn(heading, 2)];
}

/**
 * Bir adim.
 *
 * `isOpen` hucrenin gecilebilir olup olmadigini soyler; kapali hucre duvar,
 * yapi ya da tur boyunca yasaklanmis bir cikmaz sokak olabilir -- gezinme
 * acisindan ucu de aynidir.
 */
export function stepBlindNavigator(
  from: { col: number; row: number },
  state: BlindNavigatorState,
  isOpen: (col: number, row: number) => boolean,
  pickHand: () => BlindHand = () => "left"
): BlindStepResult {
  const preferred = step(from, BLIND_PREFERRED_HEADING);

  // Serbest yuruyus: sayac sifirdayken ve on acikken hep asagi.
  if (state.mode === "seek") {
    if (isOpen(preferred.col, preferred.row)) {
      return { kind: "move", col: preferred.col, row: preferred.row, state: { ...state, heading: BLIND_PREFERRED_HEADING } };
    }

    // Ilk temas: el burada seciliyor ve birakilana kadar degismiyor. Her adimda
    // yeniden secmek, kacinmaya calistigimiz salinimin ta kendisi olurdu.
    // Duvar ele denk gelecek sekilde donulur. Bu yapilmazsa "once ele dogru
    // dene" kurali ilk adimda duvardan uzaklasan yone bakar ve dusman duvari
    // takip etmek yerine yanindan savrulur.
    const hand = pickHand();
    const entryHeading = turn(BLIND_PREFERRED_HEADING, -handTurn(hand));
    const wallState: BlindNavigatorState = {
      mode: "wall",
      hand,
      heading: entryHeading,
      entryCol: from.col,
      entryRow: from.row,
      entryHeading
    };
    // Giris adiminda cevrim aranmaz: cift zaten burada kuruluyor. Cift, umut
    // edilen yonle degil **fiilen secilen** yonle kurulur; kenardan baslayan
    // dusmanda umut edilen yon harita disina bakar, o yon hic secilemez ve
    // cevrim tespiti sonsuza kadar sessiz kalirdi.
    const entered = followWall(from, wallState, isOpen, preferred, true);
    return { ...entered, state: { ...entered.state, entryHeading: entered.state.heading } };
  }

  // Duvari birakma sarti: on acik ve bu adim dusmani takildigi satirin altina
  // indiriyor. Daha yukarida birakmak, ayni engele tekrar tosladigi icin
  // salinima doner; asagi inmeyi sart kosmak her turu bir oncekinden daha
  // asagida bitirir ve satir sayisi sonlu oldugu icin is biter.
  if (preferred.row > state.entryRow && isOpen(preferred.col, preferred.row)) {
    return {
      kind: "move",
      col: preferred.col,
      row: preferred.row,
      state: { ...state, mode: "seek", heading: BLIND_PREFERRED_HEADING }
    };
  }

  return followWall(from, state, isOpen, preferred, false);
}

function followWall(
  from: { col: number; row: number },
  state: BlindNavigatorState,
  isOpen: (col: number, row: number) => boolean,
  preferred: { col: number; row: number },
  justEntered: boolean
): BlindStepResult {
  const atEntry = from.col === state.entryCol && from.row === state.entryRow;

  for (const heading of wallFollowOrder(state.heading, state.hand)) {
    const target = step(from, heading);
    if (!isOpen(target.col, target.row)) {
      continue;
    }

    const next: BlindNavigatorState = { ...state, mode: "wall", heading };

    // Cevrim kapandi: basladigi hucreden ayni yone ikinci kez cikiliyor.
    if (!justEntered && atEntry && heading === state.entryHeading) {
      return { kind: "attack", col: preferred.col, row: preferred.row, state: next };
    }

    return { kind: "move", col: target.col, row: target.row, state: next };
  }

  // Dort yon de kapali: kirmaktan baska secenek yok.
  return { kind: "attack", col: preferred.col, row: preferred.row, state };
}
