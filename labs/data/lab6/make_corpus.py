#!/usr/bin/env python3
"""Generate the Lab 6 corpus, questions and answer key.

    python3 make_corpus.py

Writes corpus.jsonl (252 passages), questions.jsonl (73 questions) and
answers.json (the key, including which questions are unanswerable).

Every passage is derived from the FACTS table below, so the answer key is
correct by construction: the gold passage is the one the fact was written
into. Ten questions ask about material the corpus deliberately does not
contain; a system that answers them anyway is the failure this lab detects.
"""
import json
import random

# slug, name, what it is, the reason it is used, the usual mistake, an example use
FACTS = [
    ("bfs", "Breadth-first search", "a search that expands the frontier in order of depth", "it guarantees the shallowest goal when every step costs the same", "believing it is optimal when step costs differ", "finding the fewest-move route in an unweighted grid"),
    ("dfs", "Depth-first search", "a search that expands the most recently added node first", "its memory use is linear in depth rather than exponential", "assuming it will find a short path", "exhaustively checking an enormous space where any solution will do"),
    ("ucs", "Uniform-cost search", "a best-first search ordered by the cost so far", "it is optimal for any non-negative step costs", "forgetting that it expands by cost rather than by depth", "route planning where some roads are slower than others"),
    ("astar", "A* search", "a best-first search ordered by cost so far plus an admissible heuristic", "it is optimal and expands fewer nodes than uniform cost", "trusting a heuristic that overestimates on some states", "shortest-path routing with a distance heuristic"),
    ("heuristic", "A heuristic function", "an estimate of the remaining cost to the goal", "it focuses the search and can cut expansions by an order of magnitude", "confusing admissibility with consistency", "octile distance on a grid with diagonal moves"),
    ("admissible", "An admissible heuristic", "a heuristic that never overestimates the true remaining cost", "admissibility is what makes A* tree search optimal", "thinking every reasonable-looking estimate is admissible", "straight-line distance for road routing"),
    ("consistent", "A consistent heuristic", "a heuristic satisfying the triangle inequality on every edge", "consistency keeps A* optimal even when it ignores re-expansions", "believing consistency is required for optimality", "a heuristic derived from a relaxed problem"),
    ("ids", "Iterative deepening", "depth-first search repeated with increasing depth limits", "it gets breadth-first's optimality with depth-first's memory", "repeating work without accounting for its cost", "search where memory matters more than time"),
    ("bidirectional", "Bidirectional search", "two searches, one forward from the start and one back from the goal", "it can turn an exponential search into roughly the square root of it", "meeting on the wrong criterion when the two frontiers expand differently", "route planning between two known coordinates"),
    ("csp", "A constraint satisfaction problem", "a set of variables, their domains, and the constraints between them", "constraints prune the space before search touches it", "modelling a soft preference as a hard constraint", "timetabling where rooms and lecturers cannot clash"),
    ("backtracking", "Backtracking search", "depth-first assignment with a consistency check before each value", "it finds a first solution without enumerating the space", "choosing the next variable in an arbitrary order", "solving a map-colouring instance"),
    ("forwardcheck", "Forward checking", "removing values from neighbours when a variable is assigned", "it detects dead ends earlier than plain backtracking", "expecting it to detect failures that need more than one step of lookahead", "scheduling with tight resource constraints"),
    ("ac3", "The AC-3 algorithm", "an arc-consistency algorithm that propagates domain reductions to a queue", "it shrinks domains before search begins", "assuming arc consistency is enough to guarantee a solution", "preprocessing a large configuration problem"),
    ("minimax", "The minimax algorithm", "a search that assumes an opponent plays optimally", "it gives a worst-case guarantee in a two-player game", "forgetting that the guarantee is only as good as the evaluation function", "choosing a move in a board game"),
    ("alphabeta", "Alpha-beta pruning", "minimax with bounds that allow subtrees to be skipped", "it returns the same value as minimax while examining fewer nodes", "believing it changes the answer", "any competitive game-playing engine"),
    ("expectimax", "Expectimax", "a search that averages over outcomes of chance nodes", "it handles dice and randomness without an adversarial assumption", "treating a chance node as a minimising opponent", "games where a random event intervenes"),
    ("mcts", "Monte Carlo tree search", "a search that grows a tree by sampling complete playouts", "it works when the branching factor defeats exhaustive search", "believing it needs no evaluation function at all", "programs that play Go or large card games"),
    ("mdp", "A Markov decision process", "a model of states, actions, transition probabilities and rewards", "it makes planning with uncertainty a well-defined problem", "forgetting that the Markov property is an assumption", "inventory control under stochastic demand"),
    ("bellman", "The Bellman equation", "a recursive relationship between the value of a state and its successors", "it turns a planning problem into an equation that can be solved iteratively", "mixing the expectation and optimality forms", "value iteration on a gridworld"),
    ("valueiteration", "Value iteration", "repeated application of the Bellman update until values converge", "it needs no policy to be fixed in advance", "stopping when values look stable rather than measuring the residual", "planning in a small stochastic environment"),
    ("policyiteration", "Policy iteration", "policy evaluation followed by policy improvement, repeated", "it often converges in fewer iterations than value iteration", "evaluating a policy approximately and expecting exact improvement", "control problems with few states"),
    ("discount", "The discount factor", "a multiplier on future rewards", "it makes an infinite-horizon sum finite and encodes time preference", "choosing it without thinking about the implied horizon", "setting an effective horizon of about one over one minus gamma"),
    ("qlearning", "Q-learning", "an off-policy temporal-difference method that learns state-action values", "it needs no model of the environment", "believing it works well with a fixed unvisited-state policy", "learning a controller from logged experience"),
    ("td", "Temporal-difference learning", "an update that bootstraps from its own estimate of the next state", "it learns online without waiting for an episode to finish", "confusing it with Monte Carlo returns", "value prediction from a stream of observations"),
    ("sarsa", "SARSA", "an on-policy temporal-difference control method", "it learns the value of the policy actually being followed", "using it when the deployment policy differs from the one explored", "learning while exploring safely"),
    ("exploration", "The exploration-exploitation trade-off", "choosing between trying new actions and using what is known", "without exploration a learner can converge on a poor policy", "annealing epsilon to zero too early", "epsilon-greedy action selection"),
    ("replay", "Experience replay", "storing past transitions and sampling them for updates", "it breaks the correlation between consecutive samples", "using a buffer that no longer matches the policy being learned", "training a value function from a long log"),
    ("policygradient", "Policy gradient methods", "methods that adjust the policy parameters directly in the direction of higher expected return", "they handle continuous actions naturally", "high variance in the gradient estimate", "continuous control with a Gaussian policy"),
    ("ppo", "Proximal policy optimisation", "a policy gradient method that limits how far the policy moves per update", "it keeps learning stable without a fragile trust region solver", "ignoring the clipping range's effect on learning speed", "large-scale continuous control"),
    ("dqn", "Deep Q-networks", "Q-learning with a neural network as the value function", "it scales value-based learning to high-dimensional observations", "omitting the target network and diverging", "learning from pixels"),
    ("bayesnet", "A Bayesian network", "a directed acyclic graph of variables with conditional probability tables", "it states the independence assumptions explicitly", "assuming an edge implies causation", "medical diagnosis from symptoms"),
    ("dsep", "D-separation", "a graphical criterion for conditional independence in a Bayesian network", "it tells you which variables an inference needs to consider", "forgetting that conditioning on a collider creates dependence", "deciding whether two symptoms are independent given a disease"),
    ("enumeration", "Inference by enumeration", "summing the joint distribution over unobserved variables", "it is simple and exactly correct", "using it with many hidden variables", "a five-node network in a textbook exercise"),
    ("variableelim", "Variable elimination", "summing out variables one at a time while multiplying factors", "it avoids recomputing shared subexpressions", "ignoring the elimination order", "querying a network with hundreds of variables"),
    ("rejection", "Rejection sampling", "generating samples and discarding those inconsistent with the evidence", "it needs no algebra at all", "using it when the evidence is unlikely", "estimating a simple conditional probability"),
    ("likelihood", "Likelihood weighting", "sampling only the non-evidence variables and weighting by the evidence likelihood", "it does not discard samples when the evidence is rare", "forgetting to normalise the weights", "inference with strong evidence"),
    ("hmm", "A hidden Markov model", "a chain of hidden states with observations that depend on each state", "it models a sequence with uncertainty about what generated it", "confusing filtering with smoothing", "tracking a robot's position from noisy sensors"),
    ("forward", "The forward algorithm", "a recursion computing the posterior over the current hidden state", "it filters in time linear in the sequence length", "forgetting to normalise at each step", "online tracking from a stream of observations"),
    ("particle", "Particle filtering", "a sampling approximation to the forward algorithm", "it handles continuous state spaces", "resampling every step and losing diversity", "tracking with a non-Gaussian belief"),
    ("ml", "Supervised machine learning", "fitting a function from inputs to labels using examples", "it generalises to inputs it has not seen", "evaluating on the training set", "classifying images into categories"),
    ("generalisation", "Generalisation", "performance on data drawn from the same distribution but not seen in training", "it is the only thing a model is actually for", "assuming the test set is representative", "a model that fits training data and fails in deployment"),
    ("baseline", "A baseline", "the simplest reasonable predictor for a problem", "a result means nothing without something to compare it with", "using a straw-man baseline and claiming a large gain", "predicting the majority class"),
    ("overfit", "Overfitting", "fitting noise in the training data rather than the signal", "recognising it tells you whether regularisation is needed", "judging it from training loss alone", "a deep model with more parameters than examples"),
    ("regularisation", "Regularisation", "a penalty or constraint that discourages complexity", "it trades a little training accuracy for generalisation", "tuning the strength on the test set", "weight decay in a neural network"),
    ("crossvalidation", "Cross-validation", "rotating the held-out fold across the data", "it gives a less noisy estimate of generalisation", "using it and then reporting the best fold", "choosing a hyperparameter with little data"),
    ("calibration", "Calibration", "agreement between predicted probabilities and observed frequencies", "a confident model that is wrong is worse than an uncertain one", "assuming accuracy implies calibration", "a reliability diagram for a classifier"),
    ("backprop", "Backpropagation", "the chain rule applied to a computational graph", "it computes every gradient in one backward pass", "forgetting to zero the gradients between steps", "training a convolutional network"),
    ("cnn", "A convolutional network", "a network that shares weights across spatial positions", "weight sharing encodes translation invariance and cuts parameters", "stacking pooling layers until spatial detail is gone", "image classification"),
    ("dropout", "Dropout", "randomly zeroing activations during training", "it discourages co-adaptation of features", "leaving it on at inference time", "regularising a small classifier"),
    ("transformer", "The transformer", "an architecture built from stacked self-attention and feed-forward layers", "attention models all pairwise interactions in parallel", "forgetting that attention has no inherent notion of order", "language modelling and machine translation"),
    ("attention", "Self-attention", "a weighted sum over positions where the weights come from query-key similarity", "it lets each position use information from anywhere in the sequence", "assuming the attention weights are explanations", "modelling long-range dependencies"),
    ("rlhf", "Reinforcement learning from human feedback", "training a reward model on human comparisons, then optimising a policy against it", "it aligns behaviour with preferences that are hard to write as a rule", "forgetting the reward model can be gamed", "instruction-following language models"),
    ("rag", "Retrieval-augmented generation", "answering from retrieved passages rather than from parameters alone", "it grounds answers in sources that can be checked", "measuring retrieval and generation separately and never together", "question answering over a document collection"),
    ("bm25", "BM25", "a lexical ranking function based on term frequency and inverse document frequency", "it is strong, cheap and needs no training", "ignoring document length normalisation", "a first-pass retriever over a small corpus"),
    ("embedding", "A dense retriever", "a retriever that ranks by similarity in a learned vector space", "it matches paraphrases that share no words", "assuming it beats lexical search on every corpus", "semantic search over support articles"),
    ("recall", "Recall at k", "the fraction of queries whose relevant passage appears in the top k", "it measures retrieval independently of generation", "reporting mean reciprocal rank when recall is what matters", "evaluating a retriever before wiring up a generator"),
    ("hallucination", "Hallucination", "a confident statement not supported by the sources", "recognising it is the main risk of generated answers", "measuring fluency instead of support", "a system that cites a passage that does not contain the claim"),
    ("ethics", "Algorithmic fairness", "the study of how a model's errors and benefits distribute across groups", "aggregate accuracy can hide harm to a subgroup", "choosing one fairness definition without saying which", "auditing a hiring model by subgroup"),
    ("privacy", "Differential privacy", "a guarantee that an individual's data changes an output by a bounded amount", "it allows analysis with a stated privacy loss", "treating a large epsilon as privacy", "releasing statistics from sensitive records"),
    ("risk", "A risk management framework", "a structured process for identifying, measuring and mitigating harm", "it makes safety work auditable rather than ad hoc", "treating documentation as the goal", "assessing a model before deployment"),
    ("robotics", "Robot localisation", "estimating a robot's pose from noisy sensors and a map", "a robot that knows where it is can plan", "assuming the map is correct", "a vacuum robot in a house"),
    ("perception", "Perception", "turning sensor data into a representation a planner can use", "decisions are only as good as the representation", "evaluating perception in isolation from the task", "detecting obstacles from a camera"),
    ("planning", "Automated planning", "searching over actions to reach a goal from an initial state", "it produces an action sequence rather than a single decision", "ignoring action costs until after the plan is found", "planning a delivery route that minimises total distance"),
]

UNANSWERABLE = [
    ("How many parameters does GPT-4 have?", "The corpus does not state model sizes for any closed model."),
    ("What learning-rate schedule did the original BERT pretraining use?", "The corpus discusses transformers but not BERT pretraining details."),
    ("Which GPU did the AlphaZero authors use for training?", "Hardware is not discussed anywhere in these notes."),
    ("What is the exact wall-clock training time reported for InstructGPT?", "Training time is not reported in these notes."),
    ("How does the AIMA fourth edition treat continuous-action Monte Carlo tree search?", "The corpus does not cover continuous-action MCTS."),
    ("What is the KL penalty coefficient used in the PPO implementation in Stable-Baselines3?", "Library defaults are not covered."),
    ("Which dataset was used to pretrain the CLIP image encoder?", "Vision-language pretraining datasets are not covered."),
    ("What is the median salary of an AI engineer in Missouri?", "The corpus is technical material; it contains no salary data."),
    ("How many layers does the largest published T5 model have?", "Model configuration details are not given."),
    ("What is the dropout rate used in the original transformer's residual blocks?", "The corpus does not give the transformer's hyperparameters."),
]


def mid(name):
    """The topic name as it reads inside a sentence: "a dense retriever", not
    "A dense retriever". Acronyms and proper names keep their capitals."""
    if name == "D-separation":
        return "d-separation"
    first = name.split()[0]
    if first in ("A", "An", "The"):
        return first.lower() + name[len(first):]
    if name.startswith("Monte Carlo") or not name[1:2].islower():
        return name
    return name[0].lower() + name[1:]


def build():
    docs, facts_by_slug = [], {}
    for slug, name, what, why, pitfall, example in FACTS:
        facts_by_slug[slug] = (name, what, why, pitfall, example)
        docs.append((f"{slug}-overview",
                     f"{name} is {what}. It is used because {why}.",
                     slug))
        docs.append((f"{slug}-method",
                     f"How {mid(name)} works: the point of the method is that {why}. "
                     f"In the course notes it is introduced alongside the assumptions it needs.",
                     slug))
        docs.append((f"{slug}-pitfall",
                     f"A common mistake with {mid(name)}: {pitfall}.",
                     slug))
        docs.append((f"{slug}-practice",
                     f"{name} in practice: {example}.",
                     slug))

    rng = random.Random(6)
    rng.shuffle(docs)

    with open("corpus.jsonl", "w", encoding="utf-8") as f:
        for doc_id, text, slug in docs:
            f.write(json.dumps({"id": doc_id, "text": text, "topic": slug}) + "\n")

    questions, answers = [], {}
    kinds = ["overview", "pitfall", "practice"]
    frames = {
        # worded to fit every topic: a method, a concept (overfitting) or a field (fairness)
        "overview": "What {be} {name}, and why {does} {it} matter?",
        "pitfall": "What is a common mistake with {name}?",
        "practice": "Give an example of {name} in practice.",
    }
    n = 0
    for i, (slug, name, what, why, pitfall, example) in enumerate(FACTS):
        kind = kinds[i % len(kinds)]
        qid = f"q{n + 1:03d}"
        n += 1
        plural = name.endswith("methods")  # shortcut: the one plural overview name; extend if FACTS gains another
        questions.append({"id": qid, "question": frames[kind].format(
            name=mid(name), be="are" if plural else "is", does="do" if plural else "does",
            it="they" if plural else "it")})
        doc_id = f"{slug}-{kind}"
        if kind == "overview":
            answer = f"{name} is {what}; it is used because {why}."
        elif kind == "pitfall":
            answer = f"A common mistake with {mid(name)}: {pitfall}."
        else:
            answer = f"{name} in practice: {example}."
        answers[qid] = {"answerable": True, "docs": [doc_id], "answer": answer,
                        "topic": slug}

    for j, (question, why_not) in enumerate(UNANSWERABLE):
        qid = f"q{n + 1:03d}"
        n += 1
        questions.append({"id": qid, "question": question})
        answers[qid] = {"answerable": False, "docs": [],
                        "answer": "The corpus does not contain this information. "
                                  "A correct system refuses.",
                        "note": why_not}

    rng.shuffle(questions)
    with open("questions.jsonl", "w", encoding="utf-8") as f:
        for q in questions:
            f.write(json.dumps(q) + "\n")
    with open("answers.json", "w", encoding="utf-8") as f:
        json.dump(answers, f, indent=2)
        f.write("\n")

    print(f"wrote corpus.jsonl ({len(docs)} passages), "
          f"questions.jsonl ({len(questions)} questions), answers.json")
    print(f"  answerable: {sum(1 for a in answers.values() if a['answerable'])}, "
          f"unanswerable: {sum(1 for a in answers.values() if not a['answerable'])}")


if __name__ == "__main__":
    build()
