import json
import requests
import datetime

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

# The cookie JSON provided by the user
COOKIES = [
  {
    "name": "netflix-sans-normal-3-loaded",
    "value": "true",
    "domain": ".netflix.com",
    "path": "/",
    "secure": False,
    "httpOnly": False,
    "sameSite": "Lax",
    "expirationDate": 1777294406.965055,
    "hostOnly": False,
    "session": False,
    "storeId": "0"
  },
  {
    "name": "netflix-mfa-nonce",
    "value": "Bgi_tOvcAxK5AYGoCLTgQwMUuoVA0mXH0-7uV03XxQF3ebthI63AVQwm6ThCSSJu_R4Iv0d19kLthCrwP8hFL4u13UfeXJqw4yPeQDHSVxx2DeBz3wuiVn3_u7BCUlIUx4xoBvlkyWpib4dkEk-yEqXrodQUYNXyR69BucBjjeioJNn2b59wpflTqLIB2Tp8REovMWQ3odd0jPKL7DB0iNVBZAsrTa4C5NgBTOkh5Bc9EyhlVIQv7lCVuZMM23uRhM-HGAYiDgoM4sANQjbi7LyOr59v",
    "domain": ".netflix.com",
    "path": "/",
    "secure": True,
    "httpOnly": True,
    "sameSite": "strict",
    "expirationDate": 1801734442,
    "hostOnly": False,
    "session": True,
    "storeId": "0"
  },
  {
    "name": "SecureNetflixId",
    "value": "v%3D3%26mac%3DAQEAEQABABSkyKLkDZQ9vlTQBi9x9IdAC-LfNrvZCtg.%26dt%3D1769518372542",
    "domain": ".netflix.com",
    "path": "/",
    "secure": True,
    "httpOnly": True,
    "sameSite": "strict",
    "expirationDate": 1785070372.987809,
    "hostOnly": False,
    "session": False,
    "storeId": "0"
  },
  {
    "name": "gsid",
    "value": "4625984e-b04a-4d69-a130-c626a305db19",
    "domain": ".netflix.com",
    "path": "/",
    "secure": True,
    "httpOnly": True,
    "sameSite": "no_restriction",
    "expirationDate": 1769604771.737563,
    "hostOnly": False,
    "session": False,
    "storeId": "0"
  },
  {
    "name": "NetflixId",
    "value": "v%3D3%26ct%3DBgjHlOvcAxL5AjAvk62blXtjs7nphYTBBe8q5vwcKw3_BmbEIF_M7kP-O2yc05v-dUqlmwgWsroIqJElfoUHjNB6dhEEWD-emD1SemYSy0pALKOyXt4ypJZx6BDjtHozvS58gePFhwHv6K5Dn-agkbuYQCmh9U0P07cQKDkLIRI5x86g_1950l7xvtMfxbVecrlppHLBwdXA2H2OPJBF30-FEi9yl5usgvtSw_07tV2el6W7tnb26X_0YDB-yts1cZO_UvoMx0hYii2QjnqDPYaAmQR1Qo9d_AQr2Eu9Xh7aCo3I2dG_0wRbv5eN76bj7xpffxIm-7RbHm75r_ngbZq1NxnJKhZn_FMRgNPjE7e7AIq6A18bnon-iNl0Bjp9VGJ_d7hbsjMgCz4-GadnrxBEEvLboMPRchFuCvXRdBmV4otJIKPKz3RQbBVDlydm2SPp1nApLakf5H4SizGCtMbpAGrZYzsYflYkdLq33obs6v5hUXFrPQQyeUVlPBttg8CXGAYiDgoMbjdb8erqueohejYe%26pg%3DIX3KWYSA6NE55BKPCDZA25YV3Y%26ch%3DAQEAEAABABQqqN8XgyT8_H_ueVR0VH1Aq-hs81EAQJc.",
    "domain": ".netflix.com",
    "path": "/",
    "secure": True,
    "httpOnly": True,
    "sameSite": "lax",
    "expirationDate": 1785070372.988065,
    "hostOnly": False,
    "session": False,
    "storeId": "0"
  },
  {
    "name": "OptanonConsent",
    "value": "isGpcEnabled=0&datestamp=Sun+Jan+04+2026+15%3A02%3A04+GMT-0800+(Pacific+Standard+Time)&version=202510.2.0&browserGpcFlag=0&isIABGlobal=false&hosts=&consentId=f74a346a-a325-4964-9a3f-cfd8a5dea346&interactionCount=2&isAnonUser=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1&AwaitingReconsent=false&intType=3&geolocation=BR%3BSP",
    "domain": ".netflix.com",
    "path": "/",
    "secure": False,
    "httpOnly": False,
    "sameSite": "Lax",
    "expirationDate": 1801734442,
    "hostOnly": False,
    "session": True,
    "storeId": "0"
  },
  {
    "name": "flwssn",
    "value": "27d9c5d8-e4e9-4a74-8ce2-c1616bc79a5f",
    "domain": ".netflix.com",
    "path": "/",
    "secure": False,
    "httpOnly": False,
    "sameSite": "Lax",
    "expirationDate": 1769529177.574916,
    "hostOnly": False,
    "session": False,
    "storeId": "0"
  },
  {
    "name": "netflix-sans-bold-3-loaded",
    "value": "true",
    "domain": ".netflix.com",
    "path": "/",
    "secure": False,
    "httpOnly": False,
    "sameSite": "Lax",
    "expirationDate": 1777294406.965399,
    "hostOnly": False,
    "session": False,
    "storeId": "0"
  },
  {
    "name": "nfvdid",
    "value": "BQFmAAEBEFTPRQ2GWYMIHHo9JiObhXNgqUiI6dzztO5MIAsDJNA-rCcLOaNQOOXphbWfgKl80RU8SlVTnqGUilmqzKo7SJIqeF1wuIEsAb4YI3az0OOwPLIXTqESDbwtZfC46kl8m6C2DBw-0bcfLzi6t3teWOzT",
    "domain": ".netflix.com",
    "path": "/",
    "secure": False,
    "httpOnly": False,
    "sameSite": "Lax",
    "expirationDate": 1785070371.737277,
    "hostOnly": False,
    "session": False,
    "storeId": "0"
  }
]

def insert_cookie():
    # Convert cookies to JSON string
    cookies_json = json.dumps(COOKIES)
    
    # Create payload
    # Description serves as a label. Using a timestamp for uniqueness/tracking.
    payload = {
        "cookies": cookies_json,
        "description": f"Manual Insert {datetime.datetime.now()}"
    }

    # Headers
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    print("Sending request to Supabase...")
    response = requests.post(f"{SUPABASE_URL}/rest/v1/cookie_sessions", json=payload, headers=headers)

    if response.status_code == 201:
        print("Success! Cookie inserted.")
        print(response.text)
    else:
        print(f"Error: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    insert_cookie()
