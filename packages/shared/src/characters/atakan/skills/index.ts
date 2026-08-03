import { makeSkills } from "../../common/factory.js";

export const atakanSkills = makeSkills("warrior", [
  ["Yönlendirme", "Basılı tutup sürükleyerek haritada bir alan işaretler. 3 saniye boyunca mermi vuruşlu kuleler menzil sınırını yok sayıp o alandaki düşmanlara ateş eder ve alandaki düşmanlar %30 fazla hasar alır. Hattın uzağında açılan sızıntıyı kapatmak için kullanılır.", 16000],
  ["Refactor", "Seçili kuleyi altın kaybetmeden başka bir uygun kareye taşır. Seviyesi ve birikmiş bonusları korunur; yanlış yerleşimi satıp yeniden kurmak yerine düzeltmeyi sağlar.", 24000],
  ["Sessiz Mod", "Tüm kuleler 5 saniye ateşi keser. Sürenin sonunda hasar sınıfı kulelerin atış hızı 5 saniyeliğine 3 katına çıkar. Bilerek verilen sessizliğin ardından gelen patlama penceresidir; dalganın yığıldığı ana denk getirilir.", 32000]
]);
