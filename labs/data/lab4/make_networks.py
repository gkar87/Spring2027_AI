#!/usr/bin/env python3
"""Generate the Lab 4 inference data.

    python3 make_networks.py

Writes alarm.json, chain20.json, dense.json, hmm_params.json and
hmm_observations.txt. Deterministic.

Network format
--------------
{
  "name": "...",
  "order": ["Burglary", "Earthquake", ...],   # variables, parents before children
  "cpt": {
     "Alarm": {"parents": ["Burglary", "Earthquake"],
               "table": [[0.999, 0.001], [0.71, 0.29], [0.06, 0.94], [0.05, 0.95]]}
  }
}

Every variable is binary with states [false, true]. A table row is the
distribution of the variable given one configuration of its parents, and rows
step through parent configurations in binary counting order with the FIRST
parent as the most significant bit: for parents [B, E] the rows are
(false,false), (false,true), (true,false), (true,true). The last entry of each
row is P(variable = true).
"""
import json
import random

# ------------------------------------------------------------- the networks
ALARM = {
    "name": "alarm",
    "note": "The textbook alarm network. Small enough that enumeration is instant and you can check every number by hand.",
    "order": ["Burglary", "Earthquake", "Alarm", "JohnCalls", "MaryCalls"],
    "cpt": {
        "Burglary": {"parents": [], "table": [[0.999, 0.001]]},
        "Earthquake": {"parents": [], "table": [[0.998, 0.002]]},
        "Alarm": {"parents": ["Burglary", "Earthquake"],
                  "table": [[0.999, 0.001],
                            [0.71, 0.29],
                            [0.06, 0.94],
                            [0.05, 0.95]]},
        "JohnCalls": {"parents": ["Alarm"], "table": [[0.95, 0.05], [0.10, 0.90]]},
        "MaryCalls": {"parents": ["Alarm"], "table": [[0.99, 0.01], [0.30, 0.70]]},
    },
}


def chain(n, seed):
    """A long chain: cheap for elimination with a good order, brutal for enumeration."""
    rng = random.Random(seed)
    names = [f"L{i:02d}" for i in range(n)]
    cpt = {}
    for i, name in enumerate(names):
        if i == 0:
            cpt[name] = {"parents": [], "table": [[0.6, 0.4]]}
        else:
            p = round(rng.uniform(0.05, 0.35), 3)
            q = round(rng.uniform(0.05, 0.35), 3)
            cpt[name] = {"parents": [names[i - 1]],
                         "table": [[1 - p, p], [1 - q, q]]}
    return {"name": "chain20",
            "note": "Twenty variables in a line. Elimination with a good order is linear; enumeration is 2^19 terms.",
            "order": names, "cpt": cpt}


def dense(m, seed):
    """A clique: every pair connected, so elimination always produces a big factor."""
    rng = random.Random(seed)
    names = [f"D{i}" for i in range(m)]
    cpt = {}
    for i, name in enumerate(names):
        parents = names[:i]
        rows = 1 << len(parents)
        table = []
        for k in range(rows):
            p = round(rng.uniform(0.2, 0.8), 3)
            table.append([round(1 - p, 3), p])
        cpt[name] = {"parents": parents, "table": table}
    return {"name": "dense",
            "note": "Eight variables, each depending on all the ones before it. Every elimination order blows up; that is the point.",
            "order": names, "cpt": cpt}


# ------------------------------------------------------------------ the HMM
HMM = {
    "name": "weather_umbrella",
    "note": "Three hidden states (sun, cloud, rain) and four observations (none, coat, umbrella, both).",
    "states": ["sun", "cloud", "rain"],
    "observations": ["none", "coat", "umbrella", "both"],
    "initial": [0.5, 0.3, 0.2],
    "transition": [
        [0.6, 0.3, 0.1],
        [0.3, 0.5, 0.2],
        [0.1, 0.3, 0.6],
    ],
    "emission": [
        [0.70, 0.20, 0.05, 0.05],
        [0.20, 0.50, 0.15, 0.15],
        [0.05, 0.15, 0.45, 0.35],
    ],
}


def sample_sequence(hmm, length, seed):
    rng = random.Random(seed)
    def draw(probs):
        x, acc = rng.random(), 0.0
        for i, p in enumerate(probs):
            acc += p
            if x <= acc:
                return i
        return len(probs) - 1
    state = draw(hmm["initial"])
    obs, hidden = [], []
    for _ in range(length):
        state = draw(hmm["transition"][state])
        obs.append(draw(hmm["emission"][state]))
        hidden.append(state)
    return obs, hidden


def main():
    nets = [ALARM, chain(20, 5), dense(8, 9)]
    for net in nets:
        with open(f"{net['name']}.json", "w", encoding="utf-8") as f:
            json.dump(net, f, indent=2)
            f.write("\n")

    with open("hmm_params.json", "w", encoding="utf-8") as f:
        json.dump(HMM, f, indent=2)
        f.write("\n")

    obs, hidden = sample_sequence(HMM, 300, 17)
    with open("hmm_observations.txt", "w", encoding="utf-8") as f:
        f.write("# 300 observations from hmm_params.json, one integer per line,\n")
        f.write("# values index the 'observations' list. The hidden sequence is\n")
        f.write("# not provided: your filter must estimate it.\n")
        for o in obs:
            f.write(f"{o}\n")

    # a small answer file so students can check the first filter values
    alpha = list(HMM["initial"])
    alpha = [a * HMM["emission"][s][obs[0]] for s, a in enumerate(alpha)]
    z = sum(alpha)
    alpha = [a / z for a in alpha]
    with open("hmm_first_step.json", "w", encoding="utf-8") as f:
        json.dump({"note": "Posterior over hidden states after the first observation, "
                           "for checking your forward pass.",
                   "observation": obs[0],
                   "posterior": [round(a, 6) for a in alpha]}, f, indent=2)
        f.write("\n")

    for net in nets:
        print(f"wrote {net['name']}.json — {len(net['order'])} variables")
    print("wrote hmm_params.json, hmm_observations.txt, hmm_first_step.json")
    print(f"first observation is {obs[0]}, first-step posterior {[round(a, 4) for a in alpha]}")


if __name__ == "__main__":
    main()
