import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";

const jobs = [
  ["one-piece", "Manga cover art, cheerful young pirate boy with straw hat and red vest, big smile, adventure crew silhouettes behind, bright blue sky and ocean, vibrant shonen manga cover style, bold colors, high quality, detailed", "768x1344"],
  ["jujutsu", "Dark manga cover, sorcerer high school student with spiky pink hair and intense eyes, cursed energy purple flames, dark background with red glow, dark supernatural shonen cover, high quality", "768x1344"],
  ["solo-leveling", "Manhwa cover art, shadow monarch hunter with glowing purple eyes, dark armor, army of shadow soldiers rising behind, dark purple and black tones, dramatic lighting, korean webtoon cover style, high quality", "768x1344"],
  ["attack-on-titan", "Dark manga cover, young soldier with green eyes and brown hair in scarf, colossal skinless titan looming over massive walls, orange sunset sky, apocalyptic atmosphere, dramatic manga style, high quality detailed", "768x1344"],
  ["chainsaw-man", "Manga cover, devil hunter boy with chainsaw on head and chainsaw arms, red and black color scheme, gritty dark urban background, chaotic action, gritty shonen cover, high quality", "768x1344"],
  ["demon-slayer", "Anime cover art, young demon slayer swordsman with scar on face holding katana, red and dark teal tones with japanese water patterns, dramatic flame effects, dark fantasy cover, high quality", "768x1344"],
  ["berserk", "Dark fantasy manga cover, armored mercenary warrior with long black hair and massive greatsword, gothic dark medieval background, dark fantasy, dramatic chiaroscuro, high quality", "768x1344"],
  ["blue-lock", "Sports manga cover, young soccer player in blue uniform surrounded by blue flame aura, intense determined expression, dynamic angle, modern sports manga, high energy, high quality", "768x1344"],
  ["frieren", "Fantasy manga cover, white haired elf mage girl with staff walking through flower field, soft pastel watercolor style, gentle melancholic journey atmosphere, two moons in sky, soft fantasy, high quality", "768x1344"],
  ["vagabond", "Manga cover in sumi-e ink painting style, wandering samurai with topknot holding katana in wind, dramatic brush strokes, misty mountains, monochrome with red sun accent, high quality", "768x1344"],
  ["lore-olympus", "Webtoon cover art, greek goddess with pink hair in modern stylized flat art, purple and pink color palette, greek columns and pomegranate motifs, webtoon style, high quality", "768x1344"],
  ["silent-book", "Light novel book cover, cozy illustration of cat sleeping on stack of books by window with rain outside, warm soft lighting, watercolor book cover style, calm peaceful mood, high quality", "768x1344"],
  ["banner-continue", "Cinematic anime banner scene, anime girl with dark hair and red scarf looking back over shoulder, traditional japanese torii gate at sunset, drifting red petals, dramatic orange and purple sky, mountains silhouette, atmospheric anime movie still, wide composition, high quality", "1344x768"],
  ["banner-discover", "Anime banner illustration, anime girl with backpack standing before glowing torii gate at dusk, red spider lilies, warm sunset gradient sky with clouds, magical discovery atmosphere, wide banner composition, high quality detailed", "1344x768"],
];

const outCover = "/home/z/my-project/public/covers";
const outBanner = "/home/z/my-project/public/banners";
const stateFile = "/home/z/my-project/scripts/imggen-state.json";

const done = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};

async function genOne([name, prompt, size]) {
  if (done[name]) return;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const zai = await ZAI.create();
      const res = await zai.images.generations.create({ prompt, size });
      const b64 = res.data[0].base64;
      const buf = Buffer.from(b64, "base64");
      const out = name.startsWith("banner") ? `${outBanner}/${name}.png` : `${outCover}/${name}.png`;
      fs.writeFileSync(out, buf);
      done[name] = true;
      fs.writeFileSync(stateFile, JSON.stringify(done));
      console.log("OK", name);
      return;
    } catch (e) {
      console.error("FAIL", name, `attempt ${attempt}`, e.message.slice(0, 80));
      if (attempt >= 6) return;
      await new Promise((r) => setTimeout(r, 20000 * attempt)); // backoff
    }
  }
}

async function main() {
  console.log("Starting sequential generation");
  for (const j of jobs) {
    await genOne(j);
    await new Promise((r) => setTimeout(r, 6000)); // pace between requests
  }
  console.log("ALL DONE", JSON.stringify(done));
}

main().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
