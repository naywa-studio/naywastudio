"""Test scoring LLM response format and regex."""
import httpx, asyncio, os, re, json
from dotenv import load_dotenv

load_dotenv('/opt/nawa-agent/.env')
OPENROUTER_KEY = os.environ['OPENROUTER_API_KEY']
MODEL = "openai/gpt-4o-mini"


async def main():
    async with httpx.AsyncClient() as client:
        profiles_data = [
            {"index": 0, "title": "Senior React Developer", "company": "Doctrine", "location": "Paris, France", "summary": ""},
            {"index": 1, "title": "Fullstack JS Junior", "company": "BNP", "location": "Lyon", "summary": ""},
            {"index": 2, "title": "Tech Lead Frontend React Next.js", "company": "Leboncoin", "location": "Paris", "summary": ""},
        ]
        prompt = (
            "Score ces profils LinkedIn pour le poste \u00ab D\u00e9veloppeur React Senior \u00bb \u00e0 Paris.\n"
            "Crit\u00e8res : 5+ ans exp\u00e9rience senior.\n"
            "Mots-cl\u00e9s : React, TypeScript, Node.js\n\n"
            "Pour chaque profil, retourne un score global 0-100 et une estimation de s\u00e9niorit\u00e9.\n"
            "UNIQUEMENT ce JSON : [{\"index\": 0, \"score\": 85, \"seniority\": \"Senior\"}, ...]\n\n"
            "Profils :\n"
            + json.dumps(profiles_data, ensure_ascii=False)
        )

        r = await client.post(
            'https://openrouter.ai/api/v1/chat/completions',
            headers={'Authorization': 'Bearer ' + OPENROUTER_KEY},
            json={
                'model': MODEL,
                'messages': [{'role': 'user', 'content': prompt}],
                'temperature': 0.1,
                'max_tokens': 300,
            },
            timeout=35.0,
        )
        r.raise_for_status()
        content = r.json()['choices'][0]['message']['content']
        print('=== LLM raw response ===')
        print(repr(content))
        print()

        # Test non-greedy (current code)
        match_ng = re.search(r'\[.*?\]', content, re.DOTALL)
        print('Non-greedy match:', repr(match_ng.group()) if match_ng else 'NO MATCH')

        # Test greedy (better for JSON arrays)
        match_g = re.search(r'\[.*\]', content, re.DOTALL)
        print('Greedy match:', repr(match_g.group()[:200]) if match_g else 'NO MATCH')

        if match_g:
            try:
                parsed = json.loads(match_g.group())
                print('Parsed OK:', parsed)
            except Exception as e:
                print('Parse error:', e)


asyncio.run(main())
