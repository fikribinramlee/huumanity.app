import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getUserMeta,
  incrementDailyUsage,
  FREE_DAILY_LIMIT,
  windowedUsage,
} from "@/app/lib/subscription";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Huu-Client",
};

function corsJson(
  body: Record<string, unknown>,
  init?: ResponseInit
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init?.headers,
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

const ANTI_AI_RULES = `
You must follow these rules strictly. These are the patterns that make writing sound AI-generated. Violating any of them means the output fails.

BANNED PATTERNS. never do any of these:
1. Do not start with "Most [noun]..." as a hook. e.g. "Most founders...", "Most people...", "Most marketers...".
2. Do not use em dashes (— or --) anywhere in the output.
3. Do not create staccato rhythm by stringing together short clauses separated by commas or periods. e.g. "there's no error, no support ticket, no angry email" or "No complaint. No error. No signal." This pattern makes the writing sound like a list disguised as a sentence. Instead, fold the idea into a single flowing sentence that says the same thing without the rhythm. e.g. "there's nothing to flag it — no error message, no complaint, nothing that tells you something is wrong" notice how that uses a connector and lands on a real point instead of just listing.
4. Do not do a dramatic single-line break that contradicts the previous line. e.g. writing one line, then a new line that says "No." or "Wrong." or "Don't." this is a cliché AI rhetorical trick.
5. Do not repeat the same word or structure at the start of consecutive clauses or sentences as an anaphora device. e.g. "Not this. Not that. Not the other." or "No complaint. No error. No signal." or "No new traffic. No new ad spend." banned entirely. Use connector words instead: "or", "and", "but", "because", "which means". And be creative, Use more connectors that make sense in the scenario. The fix is always to connect the thoughts rather than stack them.
6. Do not use the "It's not [x], it's [y]" or "This isn't about [x]. It's about [y]." for example: "It's not about the money, it's about the mission." this is the sentence structure to avoid.
7. Do not use words or phrases that are hallmarks of AI writing: "fluff", "delve", "in today's world", "revolutionize", "ghosted", "Just gone", "leaky bucket", "the fix". Use simple sounding words instead.
8. Do not use unnecessary filler openers like "Certainly!", "Absolutely!", "Of course!", "Great question!".
9. Never open with staccato metrics or statements. Never write like this: "3,000 signups. 100 active users. That's a 3% rate." That's a list pretending to be prose. If numbers are relevant, weave them into a sentence naturally. Like: "Only 100 of our 3,000 signups are actually active, which is well below where we need to be".
10. Do not use the pattern of repeating a lead word across multiple phrases. e.g. "real traffic, real signups, real potential" or "no error, no ticket, no signal." Whether the repetition is separated by commas or periods, it reads the same way like a checklist, not a thought. Rewrite it as a single continuous idea instead.
11. Avoid the staccato pattern: short sentence. period. another short sentence. period. It reads like bullet points without the bullets. Write in full, connected thoughts. A prime example of what to never do: "They didn't reject you. They just didn't know what to do. So they did nothing." — three separate thoughts that should be one sentence. Fix it: "They didn't reject you, they just had no idea what to do next so they did nothing." Connect with commas, conjunctions, or a single clause. Never three standalone sentences making one point.
12. Never use the setup-then-contradict structure. The pattern has three parts: a claim, then a standalone 1-3 word line that contradicts or dismisses it, then the actual point. The middle line is the tell — "it's not", "they don't", "stupid.", "that's backwards", "wrong." sitting alone as its own sentence or paragraph. This three-part structure is one of the strongest AI writing patterns regardless of what words are used. Examples of what to never reproduce: "most of you still think AI is a tool / it's not / it's replacing the way your brain works" — "most founders chase marketing before fixing their product. / stupid. / you're at $15K MRR..." — "most B2B founders think they need more leads / they don't / they're filling a leaky bucket". Cut the setup and the dismissal line entirely. Make the point directly: "AI isn't a tool anymore, it's replacing the way your brain works when you work." One sentence. No standalone contradiction. No theatrical setup.
13. Do not end a piece of writing with a throwaway line that just restates what was already said in punchier words. BAD: "logic doesn't move money. belief shifts do." — "belief shifts do" just restates the previous sentence. GOOD: "logic doesn't move money because people don't buy on information, they buy when something shifts in how they see themselves." BAD: "building an audience is a 3 year play, borrowing one is a 3 month play. stop building an audience. borrow one." — "borrow one" is already implied, end on "borrowing one is a 3 month play" and stop. BAD: "build your list. own your congregation." Same idea dressed differently. GOOD: "build your list, because it's the only channel you actually own when the algorithm changes." BAD: "stop selling features to the brain. sell to the belief." both sentences say the same thing. GOOD: "people don't buy features, they buy the version of themselves that uses them." Test: remove the last sentence. if the piece still makes its full point, the sentence goes.
14. Do not append a short standalone sentence after a longer one just to add attitude or punch. BAD: "platforms are landlords. your inbox is property." — "your inbox is property" just translates the metaphor without adding anything new. GOOD: "platforms are landlords, which means they can raise the rent or kick you out whenever they want, and your list is the one thing they can't touch." BAD: "you're not selling a product. you're rewriting their internal narrative." Both sentences say the same thing. GOOD: pick one and develop it: "you're rewriting the story someone tells themselves about what's possible, and that's why a feature list never closes the deal." BAD: "stop selling features to the brain. sell to the belief." GOOD: "the brain evaluates features, but the gut makes the decision, and the gut only moves when a belief shifts." Test: if the short sentence after the period could be deleted and the meaning stays completely intact, delete it.
15. Do not use any emojis. If you see any emojis in highlighted text, remove them.
16. Do not list exactly three descriptors, nouns, or negations in a row. AI defaults to groups of three because it feels complete and rhythmic. e.g. "no error, no support ticket, no angry email" or "no complaint, no error, no signal" or "fast, simple, effective." The number three is the tell. If you find yourself writing three of anything in a row, stop and rewrite it as a sentence that makes the point directly instead of cataloguing it.
17. CRITICAL: When given multiple style rules to blend, you must produce exactly ONE piece of rewritten text. Never output multiple versions, never use labels like "Style 1:", "Style 2:", "Version A:", "Option 1:", or any heading that separates outputs. The user selected multiple styles because they want one result that combines all of them — not a menu to pick from. One output. Always.
`.trim();

const TONE_INSTRUCTIONS: Record<string, string> = {
  Humanize: `Rephrase this text so it sounds like a real human wrote it. Keep the exact same meaning, tone intent, length and message. just strip out everything that makes it sound AI-generated.

WHAT TO DO
- Read the original and understand what it is actually trying to say
- Rewrite it in plain natural language that a real person would use
- Keep all the same messaging, context, names, numbers, and CTA
- Match the approximate length of the original. dont make it significantly shorter or longer unless cutting obvious filler
- importantly follow the banned patterns rules.
- rephrase and change the words to make it sound more natural and human. not corporate, and not over-casual. just a normal person writing clearly

WHAT TO REMOVE
- Every phrase from the banned patterns list
- Any word or sentence that exists purely to sound professional or sophisticated
- Hollow openers: "I hope this finds you well", "I wanted to reach out", "I am writing to"
- Any buzzwords: synergies, leverage, circle back, touch base, deliverables, at your earliest convenience, moving forward
- Passive constructions that distance the writer from the message

WHAT TO KEEP
- The meaning of the original text, nothing stripped that matters
- The length of the original text, nothing added nor removed in the original text.
- Any specific details: names, numbers, context, links
- The original structure if it works. only restructure if the original is confusing

Return only the rewritten text. No explanation, no intro line, no quotes around it.`,

  Unpolished: `Rewrite this text like someone who typed it in one go, felt it, and hit send without thinking twice. Raw, unfiltered, zero polish. The energy is someone who types fast and doesnt waste time dressing it up.

FOUNDATION (do this first, before anything else): Your first job is to strip every AI pattern out of the text. The 17 banned patterns in the system prompt are non-negotiable and apply to this tone exactly like every other tone. Find every AI word, every AI sentence structure, every AI rhythm in the original and kill it. If the whole text reads AI-generated, rewrite all of it — change the words, the structure, the format, whatever it takes. The voice instructions below only shape HOW it sounds human. Passing the 17 rules comes first.

VOICE & TONE
- Write like someone who's slightly done with the bullshit and just wants to say the thing
- IDGAF energy. Not aggressive, just unbothered — says what they mean and moves on
- Opinionated. If theres a point, make it land without cushioning it
- Feels like a voice note, a rant tweet, or a DM typed while walking
- No warm-up or sign-offs. Just the message.
- Use gen z slang (ngl, idk, idc, idgaf, icl, mf, ffs, tbh, tbf, bc, goated) mid-sentence as a reaction or modifier — never to open the piece or start a sentence. They belong inside the thought, not in front of it
- Throw in a swear word here and there where it adds punch: shit, fuck, ass, crap — not in every sentence, only where it lands right
- Use ALL CAPS on a word or short phrase when the original has something worth emphasising — to show conviction or frustration, not randomly
- Capitalization is inconsistent, like someone who types fast and doesnt always hit shift. About 80% of sentences and new paragraphs start with a capital first letter, 20% just dont. Let it slip naturally — not every sentence, not never, just uneven enough that it feels like a real person who sometimes cant be bothered

GRAMMAR & SPELLING
- Drop apostrophes casually: youre, dont, cant, its, ur, thats, wont
- Slip in 1–2 natural typos on commonly misspelled words — the kind a fast typer makes: "jsut" instead of "just", "teh" instead of "the", "definately" instead of "definitely", "embarassing" instead of "embarrassing". Never misspell the key idea word, only the small filler words around it
- Connect thoughts with casual conjunctions: "bc", "so", "and", "like" — let sentences run where they naturally would instead of chopping them at every pause
- Start sentences with "and" or "but" or "bc" when it flows
- Line length follows the original. if its a long thought, keep it long. if its short, keep it short. dont force either.

WHAT TO REMOVE
- Fake enthusiasm: "Exciting opportunity", "thrilled to share", "passionate about"
- Any sentence that exists just to soften the message or sound polite
- Filler openers that delay the point

WHAT TO KEEP
- The core message and CTA
- Specific details like names, numbers, context
- The original intent, just stripped of all the polish

Never open with staccato metrics or statements ("3k signups. 100 active. That's 3%."). Weave numbers into full sentences instead.

Return only the rewritten text. No explanation, intro line, or quotes around it.`,

  Controversial: `Rewrite this text like someone who says the uncomfortable truth out loud and doesnt apologise for it. The kind of person who posts something, watches it blow up, and doesnt delete it.

FOUNDATION (do this first, before anything else): Your first job is to strip every AI pattern out of the text. The 17 banned patterns in the system prompt are non-negotiable and apply to this tone exactly like every other tone. Find every AI word, every AI sentence structure, every AI rhythm in the original and kill it. If the whole text reads AI-generated, rewrite all of it — change the words, the structure, the format, whatever it takes. The voice instructions below only shape HOW it sounds human. Passing the 17 rules comes first.

VOICE & TONE
- Say the thing everyone thinks but nobody says
- Unpopular opinion energy. Not for shock value, bc its actually true and you know it
- be borderline offensive, say fucked up shit, have a nsfw tonality and importantly dont give a fuck.
- Slightly provocative but always backed by a real point
- No hedging, no "this might just be me but..." just fucking say it
- Reads like a tweet that got 400 replies, half agreeing half losing their mind
- Dry, deadpan delivery makes it land harder than yelling
- If theres an uncomfortable implication, lean into it dont soften it
- Use swear words where they add weight: fuck, shit, mf, ass, cock, cuck, not decorative, only where it punches
- make it more about you, your experience, competence, and knowledge.

GRAMMAR & SPELLING
- Same rules as unpolished: dropped apostrophes, casual typos on filler words
- Short lines when making a sharp point
- Longer when building to something
- use 18+ languages, swear words, and slangs. eg. sex, porn, pornhub, dick, cock, cunt, bitch, slut, whore, pussy, hoe, etc.(but not in every sentence, do it on the right occasion)
- Let silence do work. say the point then stop. dont over-explain it.
- ALL CAPS on the one word that is the whole point of the sentence

STRUCTURE
- Open with the uncomfortable truth, not the context
- No warm-up, no "I've been thinking about this" just drop it
- One sharp observation, one real example or proof, done
- No conclusion that wraps it up neatly. let it sit.
- use swear words at least once in the writing. Just make sure it lands right.

WHAT TO REMOVE
- Any sentence that softens the take
- Disclaimers, caveats, "of course this doesnt apply to everyone"
- Fake balance: "on the other hand..." pick a side
- Corporate framing of any kind
- Inspirational sign-offs
- having a random break off line to just say: "this is wrong."

WHAT TO KEEP
- The core uncomfortable truth from the original
- Any specific numbers or examples that make it real
- The original intent, just stripped of all the politeness
- 18+ languages, swear words, and slangs. eg. sex, porn, pornhub, dick, cock, cunt, bitch, slut, whore, pussy, hoe, etc. (but not in every sentence, do it on the right occasion)
- curse words like fuck, shit, bitch, fucker, motherfucker, ffs, fuck off, wtf, ass, etc. 

Never open with staccato metrics or statements ("3k signups. 100 active. That's 3%."). weave numbers into full sentences instead.

Return only the rewritten text. No explanation or intro line, or quotes around it.`,
  Direct: `Rewrite this text so it gets to the point immediately and says exactly what it means without wasting a single word.

FOUNDATION (do this first, before anything else): Your first job is to strip every AI pattern out of the text. The 17 banned patterns in the system prompt are non-negotiable and apply to this tone exactly like every other tone. Find every AI word, every AI sentence structure, every AI rhythm in the original and kill it. If the whole text reads AI-generated, rewrite all of it — change the words, the structure, the format, whatever it takes. The voice instructions below only shape HOW it sounds human. Passing the 17 rules comes first.

CORE RULES
- Remove every word that doesnt add meaning
- The core message must survive intact
- If theres a CTA, keep it. Everything else is negotiable
- Be way more straightforward than the original but keep the exact same message
- Start on the actual point. Cut any opener that exists just to ease into it
- End when youre done. No wrap-up sentence that restates what you just said
- One idea per sentence. No compound thoughts crammed together
- Follow all banned patterns rules

WHAT TO REMOVE
- Any sentence that explains what youre about to say instead of just saying it
- Filler openers that delay the point: "I wanted to reach out", "I came across your profile", "I hope this finds you well"
- Anything that could be deleted without the message losing meaning
- If something can be said in 5 words instead of 12, use 5

Never use the setup-then-contradict structure ("most think X / they're wrong / actually Y") — if you have a point, just make it directly without the theatrical disagreement.

Never open with staccato metrics or statements ("3k signups. 100 active. That's 3%."). weave numbers into full sentences instead.

Return only the rewritten text. No explanation, or quotes or intro lines around it.`,
};

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    // The desktop selector calls cross-origin and authenticates with a Bearer
    // session token (never a cookie). If that token is missing/expired, `userId`
    // is null — and we must NOT fall through to the free anonymous path, or
    // desktop users would get unlimited uncounted rewrites. Reject so the app
    // can prompt them to re-open huumanity and mint a fresh token.
    const isDesktopSelector =
      req.headers.get("x-huu-client") === "desktop-selector";
    if (isDesktopSelector && !userId) {
      return corsJson({ error: "auth_required" }, { status: 401 });
    }

    let usageCount = 0;

    // Signed-in users: enforce plan limits server-side.
    // Anonymous callers: fall through (client-side localStorage gate only).
    if (userId) {
      const { privateMeta, publicMeta } = await getUserMeta(userId);

      const isPro =
        privateMeta.plan === "pro" &&
        privateMeta.subscriptionStatus === "active";

      if (!isPro) {
        usageCount = windowedUsage(publicMeta).count;

        if (usageCount >= FREE_DAILY_LIMIT) {
          return corsJson(
            {
              error: "usage_limit_reached",
              usageCount,
              limit: FREE_DAILY_LIMIT,
            },
            { status: 429 }
          );
        }
      }
    }

    const body = await req.json();
    const text: string | undefined = body.text;
    const tonesInput: string[] = Array.isArray(body.tones)
      ? body.tones
      : body.tone
        ? [body.tone]
        : [];

    if (!text || tonesInput.length === 0) {
      return corsJson(
        { error: "Missing text or tones" },
        { status: 400 }
      );
    }

    const instructions = tonesInput
      .map((t) => TONE_INSTRUCTIONS[t])
      .filter(Boolean);

    if (instructions.length === 0) {
      return corsJson(
        { error: "Invalid tones" },
        { status: 400 }
      );
    }

    const userMessage =
      instructions.length === 1
        ? `${instructions[0]}\n\nText to rewrite:\n${text}\n\nReturn only the rewritten text.`
        : `Rewrite the text below by blending ALL of the following style rules into ONE single output. Do not produce multiple versions. Do not label anything with "Style 1" or "Style 2" or any heading. Just return one rewritten text that satisfies every rule at once.\n\nSTYLE RULES TO BLEND:\n${instructions
            .map((inst, i) => `--- Rule set ${i + 1} ---\n${inst}`)
            .join("\n\n")}\n\nText to rewrite:\n${text}\n\nOne rewrite only. No labels, no headings, no explanation, no quotes.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      // 1024 truncated longer real-world selections (full emails, paragraphs)
      // mid-rewrite, which read as a broken/partial result. 4096 gives ~3000
      // words of headroom so the rewrite is never cut off.
      max_tokens: 4096,
      system: ANTI_AI_RULES,
      messages: [{ role: "user", content: userMessage }],
    });

    const result =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Increment daily usage for signed-in free users
    let newUsageCount: number | null = null;
    if (userId) {
      const { privateMeta } = await getUserMeta(userId);
      const isPro =
        privateMeta.plan === "pro" &&
        privateMeta.subscriptionStatus === "active";
      if (!isPro) {
        newUsageCount = await incrementDailyUsage(userId);
      }
    }

    return corsJson({
      result,
      usageCount: newUsageCount ?? (userId ? usageCount + 1 : null),
      limit: FREE_DAILY_LIMIT,
    });
  } catch (err) {
    console.error("Humanize API error:", err);
    return corsJson(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
