# Live test results

Run 2026-09-27T01:53:17+02:00 against http://localhost:8090 (real mode, Mutinynet).

```
03999c0815494050… cap 600000 local 599056 active True
039d5f33496a5bb2… cap 250000 local 249056 active True
```

## Level 1: five coins over Lightning
```
session 67cb6563-72c4-4db5-bad5-24fe3093a292 · lightning · normal · 30 coins scheduled
hits accepted 5 · replays sent to Payhook 0 · rejected 0
payouts 5: {"settled":5}
{"session":"67cb6563-72c4-4db5-bad5-24fe3093a292","accepted":5,"duplicates":0,"rejected":0,"payouts":{"settled":5}}
exit 0
```
## Cheats are refused
```
session e1d1ee80-8ea1-4dbe-83a2-40df3933d731 · lightning · normal · 31 coins scheduled
  cheat "unknown coin": rejected · No such coin in this round
  cheat "wrong position": rejected · Hit position does not match the coin's path
  cheat "instant bullet": rejected · Bullet could not have reached the coin that fast
  cheat "from the future": rejected · Hit reported from the future
  cheat "future coin": rejected · Coin was not on screen at that time
  cheat "wrong session token": HTTP 403
exit 0
```
## Money glitch: replays and the per-minute cap
```
session 1f442358-08d3-4b6f-a452-a24c9108ebda · lightning · normal · glitch · 412 coins scheduled
hits accepted 40 · replays sent to Payhook 80 · rejected 0
payouts 40: {"settled":25,"failed":15}
  failed coin 21 sat · Recipient limit reached: 25 of 25 payouts in 1 min
  failed coin 21 sat · Recipient limit reached: 25 of 25 payouts in 1 min
  failed coin 21 sat · Recipient limit reached: 25 of 25 payouts in 1 min
  failed coin 21 sat · Recipient limit reached: 25 of 25 payouts in 1 min
  failed coin 21 sat · Recipient limit reached: 25 of 25 payouts in 1 min
{"session":"1f442358-08d3-4b6f-a452-a24c9108ebda","accepted":40,"duplicates":80,"rejected":0,"payouts":{"settled":25,"failed":15}}
exit 0
```
## Recovery: the studio node's answer is lost
```
session 17542a73-313c-4d70-a324-125159b47883 · lightning · normal · 29 coins scheduled
hits accepted 1 · replays sent to Payhook 0 · rejected 0
payouts 1: {"unknown":1}
  unknown coin 21 sat · Connection to the studio node dropped before it answered
{"session":"17542a73-313c-4d70-a324-125159b47883","accepted":1,"duplicates":0,"rejected":0,"payouts":{"unknown":1}}
exit 0
```
**Rerun after a fix:** the first run left this payout `unknown` although the
player was paid: LND's REST gateway rejects unpadded base64url payment hashes
in `/v2/router/track`, so every lookup errored. Because RPC errors count as
uncertain, nothing was marked failed or paid twice; the payout waited. With
padding restored the same payout reconciled to `settled` via lookup, and a
fresh live rerun of this scene settled on its own, 21 sat received exactly once.

## Level 2: round prize as L-USDT via KaleidoSwap pay-through
```
session ef5980b4-6dae-4443-b04b-c57c85c8db91 · liquid · normal · 28 coins scheduled
hits accepted 3 · replays sent to Payhook 0 · rejected 0
payouts 1: {"settled":1}
  prize settled · Delivered on Liquid · tx 6b17a607e37a… · {"swapStatus":"invoice.settled","payoutTxid":"6b17a607e37a6c33438d46370a4c885fe4d7420a94df4abcf271006580b2b16f","payoutLayer":"LIQUID_LIQUID","destination":"tlq1qqv3a0f0ag3hfnlmsmyy4wc06e2zhxaaqyphff75a77kxgxwjkvqcm7lg32cps4ys9cszwkylwuwzdlhasdgsws96j4f2sw0el"}
{"session":"ef5980b4-6dae-4443-b04b-c57c85c8db91","accepted":3,"duplicates":0,"rejected":0,"payouts":{"settled":1}}
exit 0
```
## Player wallet after the run
```
{
    "user": "",
    "lightningAddress": null,
    "lightning": {
        "receivedSat": 651,
        "count": 31,
        "recent": [
            {
                "user": "phoenix",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:48.000Z",
                "paymentHash": "ddcad9aa294f8632d737d929ad5751b51882ae0f97d60ca993f0110cee92a08a"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:41.000Z",
                "paymentHash": "a66abb779ee9b36c68aa609772689f4ac64c11b4b99c72a764d34b6fd6bff7a5"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:41.000Z",
                "paymentHash": "01238927c093e3f02fdbb9a24f54257274d8dfb2f0bda54aed44d5a71b84101b"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:41.000Z",
                "paymentHash": "a19abe0754e52df6b3b077411e7301d603306e7bdc2a35a4717e80f54551e69d"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:41.000Z",
                "paymentHash": "eec2422c75dd074523f4f030c3baba767d5c530f83212ecaff2cdcc3073f0783"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:41.000Z",
                "paymentHash": "687dfc30ace16d35079a086e72d1a2536e1f6103bee87ed83b9cd8da2c72b732"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:41.000Z",
                "paymentHash": "a2082456a64042d269a186e656f146feda71577361374297182086d6f1e5bdd0"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:40.000Z",
                "paymentHash": "911aedfbc15f397038de9f4f2e004d319bf1482cc010af32eb83bed0a5c67639"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:40.000Z",
                "paymentHash": "9487468c9a359ab288d4c6f074920e241242f950c3b9d6536470b776a40da841"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:40.000Z",
                "paymentHash": "1fbc85e42a90187b8c6cfa24ef21f34a0014c194b0a876c75f17be33427a97c2"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:40.000Z",
                "paymentHash": "7fa7b45809350a851772a7168d65f43d2f166b735962898ef31eba2337abf4dd"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:40.000Z",
                "paymentHash": "5da08525b8591fe6c37bb8935c3b65fd76c4d32128860397c9d5e9d3e4941694"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:40.000Z",
                "paymentHash": "abf94b3e5205aec0d2f69fb54d2159712b7627c9cd7450a43ccd69509e1a8ebf"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:40.000Z",
                "paymentHash": "d206aeecf71d4d1d4377c6cdfa54d3697313fabf08b6dc339d9768bb2dd0177d"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:39.000Z",
                "paymentHash": "76b138589114aac61a6e6bbfde5da35e0d2cf0efbe6d37b58e421a2d1ea1cc08"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:39.000Z",
                "paymentHash": "70a8649d8fbf38ca1337bd87e4c0ef9a68075df371f50d408849db9a5886979b"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:39.000Z",
                "paymentHash": "451e327adeee2d482ffd1cc57b2d29921b5c85ea06d38734d21fdc666ee5a3ec"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:39.000Z",
                "paymentHash": "2f437c9ec81f8d43c351430b9b527763e382c94ad5c35f49515d9eb4d1e9cc17"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:39.000Z",
                "paymentHash": "9b993ea12a09b4521f8f2aaa3a316324566a77923a69bc15b065f8a63841b10f"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:39.000Z",
                "paymentHash": "9f247dcf63e3246ae30faa5c56e873c6dad2c36bb37c459adb35106e4886ca57"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:39.000Z",
                "paymentHash": "d2ee87b3a9d836dad95b1c44cee8f072a27b932779f032fe1a6ab21db2a98693"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:38.000Z",
                "paymentHash": "1bf4a89d79bfc19fae5b9cef14d85b02d1e5bb772e124ded1f895e7976cd71ca"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:38.000Z",
                "paymentHash": "bcdd87043c00257f269d54d3aad0fad13a8447849ce483a0a62c9d2a6a445be6"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:38.000Z",
                "paymentHash": "a3eb9c73b99a46e65cdbff9754faf674de8b714f8f35af8b3e4ee3e43a58ad4b"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:38.000Z",
                "paymentHash": "385e90b5cb68c97fb2c19402796bd9e3edbe07abcdeb00b1c9e682c68ed1e586"
            },
            {
                "user": "glitch",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:38.000Z",
                "paymentHash": "a8ef923b3d416089df9b565052a92c9c615f6301c8e5f2f146eedda6979af2c7"
            },
            {
                "user": "ada",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:29.000Z",
                "paymentHash": "1650b3f1a5e8127888a2103bb81ce4edb8189adc0f86a3dda8247637c13d9eec"
            },
            {
                "user": "ada",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:27.000Z",
                "paymentHash": "0ff58a1517a36805575e98dce18a023b613bb7b5a5dbc1df580aab65c3206b21"
            },
            {
                "user": "ada",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:25.000Z",
                "paymentHash": "5237e12fdaa8babeaed2a357765be758664fe74715b2cb6bacd91d9efb6189e1"
            },
            {
                "user": "ada",
                "amountSat": 21,
                "settledAt": "2026-09-26T23:53:23.000Z",
                "paymentHash": "87f474fdf3239b955ca260726011a4e13cc5627c5e9c4c2f6bd95239b39695e3"
            }
        ],
        "nodeLocalBalanceSat": 651
    },
    "liquid": {
        "address": "tlq1qqv3a0f0ag3hfnlmsmyy4wc06e2zhxaaqyphff75a77kxgxwjkvqcm7lg32cps4ys9cszwkylwuwzdlhasdgsws96j4f2sw0el",
        "balances": {
            "L-USDT": "4178929176",
            "L-BTC": "0"
        },
        "txCount": 1,
        "scannedAt": "2026-09-26T23:56:53.525Z"
    }
}
```

Player Liquid wallet after the swap: **41.79 L-USDT** (4,178,929,176 base units).
