"""Test Apify harvestapi directly to see what it returns."""
import httpx, asyncio, os, json
from dotenv import load_dotenv

load_dotenv('/opt/nawa-agent/.env')
APIFY_TOKEN = os.environ['APIFY_TOKEN']
APIFY_ACTOR = 'harvestapi~linkedin-profile-search'
APIFY_BASE  = 'https://api.apify.com/v2'


async def test_query(query: str) -> None:
    async with httpx.AsyncClient() as client:
        print(f"\nQuery: {query!r}")
        resp = await client.post(
            f'{APIFY_BASE}/acts/{APIFY_ACTOR}/run-sync-get-dataset-items',
            params={'token': APIFY_TOKEN, 'timeout': 90, 'memory': 512},
            json={
                'searchQuery': query,
                'profileScraperMode': 'Full',
                'takePages': 1,
                'maxItems': 5,
            },
            timeout=100.0,
        )
        print(f"  Status: {resp.status_code}")
        data = resp.json()
        print(f"  Type: {type(data).__name__}")
        if isinstance(data, list):
            print(f"  Items: {len(data)}")
            if data:
                item = data[0]
                print(f"  First item keys: {sorted(item.keys())[:10]}")
                print(f"  Name: {item.get('firstName')} {item.get('lastName')}")
                print(f"  Headline: {item.get('headline')}")
        elif isinstance(data, dict):
            print(f"  Dict keys: {list(data.keys())[:10]}")
            print(f"  Full response: {json.dumps(data)[:500]}")
        else:
            print(f"  Unexpected type: {data}")


async def main():
    await test_query('Developpeur React Paris')
    await asyncio.sleep(3)
    await test_query('React Developer Paris')


asyncio.run(main())
