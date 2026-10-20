// The guided walkthrough in the owner view's Texts: the owner texts Gus, step
// by step, against the visitor's own copy. Edit the walkthrough here only.
//   text      what the owner texts
//   expect    a reply that doesn't match is asked once more, then `fallback`
//   confirm   a YES/NO for the step before: sent only if that one was answered live
//   fallback  the saved answer shown when the live one doesn't come through
window.LARKSPUR_GUIDED = [
  {
    text: "What's on my schedule this week?",
    expect: /\w/,
    fallback:
      "This week you have a few visits booked, plus Olivia Grant's estimate request waiting for your approval. Ask me about any day for the details.",
  },
  {
    text: "What needs me?",
    expect: /Olivia/i,
    fallback:
      "1 request is waiting for you: Olivia Grant, estimate for a new lawn and a flagstone path, 48 Monte Vista Ave, Oakland.",
  },
  {
    text: "Approve Olivia's visit",
    expect: /\bYES\b/,
    fallback:
      "I will approve Olivia Grant's visit request, so it's booked and she gets a confirmation. Reply YES in the next 10 minutes to do it. Any other reply cancels it.",
  },
  {
    text: "yes",
    confirm: true,
    expect: /done|approved|booked/i,
    fallback: "Done: Olivia Grant's visit is approved and on your calendar.",
  },
  {
    text: "Mark LL-1036 paid by check today",
    expect: /\bYES\b/,
    fallback:
      "I will mark invoice LL-1036 paid by check today. Reply YES in the next 10 minutes to do it. Any other reply cancels it.",
  },
  {
    text: "yes",
    confirm: true,
    expect: /done|paid/i,
    fallback: "Done: LL-1036 is marked paid by check.",
  },
  {
    text: "Who owes me money, and for how long?",
    expect: /\$|nothing|no one|outstanding/i,
    fallback: "Here's what's outstanding, oldest first, with how long each invoice has been open.",
  },
  {
    text: "Text Luis Romero: Running 15 minutes late, see you at 10:15.",
    expect: /word for word/i,
    fallback:
      'I will e-mail Luis Romero at luis.romero@example.com, this message, word for word: "Running 15 minutes late, see you at 10:15." Reply YES in the next 10 minutes to send it. Any other reply cancels it.',
  },
  {
    text: "no",
    confirm: true,
    expect: /cancel/i,
    fallback: "I cancelled the pending change: e-mail Luis Romero. Nothing was changed.",
  },
];
