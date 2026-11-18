#!/usr/bin/env python3
"""Lab 3 environment: a gridworld you interact with but cannot inspect.

    from qenv import GridEnv
    env = GridEnv("../lab2/worlds/cliff.json", seed=7)
    s = env.reset()
    s, r, done = env.step(1)          # 0=N, 1=E, 2=S, 3=W

The class exposes reset(), step(), state_index(), n_states, n_actions and the
reward and terminal structure. Everything about how an action becomes a
transition is private: reading `_spec` or re-deriving the transition
probabilities is what the lab forbids, and a submission that does it scores
zero however good the numbers look.

Command line, for a sanity check:

    python3 qenv.py ../lab2/worlds/cliff.json
    python3 qenv.py ../lab2/worlds/cliff.json --episodes 20 --seed 3
"""
import argparse
import json
import random
from pathlib import Path

ACTIONS = [(-1, 0), (0, 1), (1, 0), (0, -1)]        # N, E, S, W
ACTION_NAMES = ["N", "E", "S", "W"]


class GridEnv:
    def __init__(self, world, seed=None):
        spec = json.loads(Path(world).read_text(encoding="utf-8"))
        self.name = spec["name"]
        self.rows, self.cols = spec["rows"], spec["cols"]
        self.start = tuple(spec["start"])
        self.walls = {tuple(w) for w in spec["walls"]}
        self.terminals = {tuple(int(v) for v in k.split(",")): float(r)
                          for k, r in spec["terminals"].items()}
        self.step_reward = float(spec["step_reward"])
        self._slip = float(spec["slip"])
        self._spec = spec                      # private: do not read this
        self._rng = random.Random(seed)
        self._free = [(r, c) for r in range(self.rows) for c in range(self.cols)
                      if (r, c) not in self.walls]
        self._index = {cell: i for i, cell in enumerate(self._free)}
        self._state = self.start

    # ---------------------------------------------------------- public API
    @property
    def n_actions(self):
        return len(ACTIONS)

    @property
    def n_states(self):
        return len(self._free)

    def state_index(self, state):
        """Dense index for a cell, so a Q-table can be a plain array."""
        return self._index[state]

    def reset(self):
        self._state = self.start
        return self._state

    def step(self, action):
        """Return (next_state, reward, done)."""
        if action not in range(len(ACTIONS)):
            raise ValueError(f"action must be 0..{len(ACTIONS) - 1}")
        if self._state in self.terminals:
            raise RuntimeError("episode is over; call reset()")
        move = ACTIONS[action]
        if self._rng.random() < self._slip:            # slip: go left or right of intent
            turn = self._rng.choice((-1, 1))
            dr, dc = ACTIONS[(action + turn) % 4]
        else:
            dr, dc = move
        r, c = self._state
        nr, nc = r + dr, c + dc
        if not (0 <= nr < self.rows and 0 <= nc < self.cols) or (nr, nc) in self.walls:
            nr, nc = r, c                              # bump: stay where you are
        self._state = (nr, nc)
        if (nr, nc) in self.terminals:
            return self._state, self.terminals[(nr, nc)], True
        return self._state, self.step_reward, False

    def rooms(self):
        """Cells that are open, for printing; not a description of transitions."""
        return list(self._free)


def main():
    ap = argparse.ArgumentParser(description="Run a random policy in a lab 3 world.")
    ap.add_argument("world", help="path to a world json, e.g. ../lab2/worlds/open6.json")
    ap.add_argument("--episodes", type=int, default=5)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    env = GridEnv(args.world, seed=args.seed)
    print(f"world {env.name}: {env.n_states} open cells, {env.n_actions} actions")
    for ep in range(args.episodes):
        s = env.reset()
        total, steps = 0.0, 0
        while True:
            a = env._rng.randrange(env.n_actions)      # the demo may use the rng
            s, r, done = env.step(a)
            total += r
            steps += 1
            if done or steps > 500:
                break
        print(f"  episode {ep + 1}: {steps:3d} steps, return {total:+.2f}")


if __name__ == "__main__":
    main()
