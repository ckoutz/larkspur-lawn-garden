// The guided walkthrough in the owner view's Texts: the owner texts Gus, step
// by step, against the visitor's own copy. Edit the walkthrough here only.
//   text      what the owner texts
//   expect    a reply that doesn't match is asked once more, then `fallback`
//   confirm   a YES/NO for the step before: sent only if that one was answered live
//   fallback  the saved example shown when the live answer doesn't come through;
//             it never claims a change, since nothing changed on the copy
window.LARKSPUR_GUIDED = [
  {
    text: "What's on my schedule this week?",
    expect: /\w/,
    fallback:
      "This week: visits booked most days, and Thu 3:00 PM: Olivia Grant, requested, waiting for your approval. Ask me about any day for the details.",
  },
  {
    text: "What needs me?",
    expect: /Olivia/i,
    fallback:
      "You have 2 items needing you:\n• Olivia Grant's visit Thu at 3:00 PM is requested, waiting for your approval.\n• Hannah Brooks's $1,240 quote is waiting for your approval.",
  },
  {
    text: "Approve Olivia's visit",
    expect: /\bYES\b/,
    fallback:
      "I will approve Olivia Grant's visit request for Thu, 3:00 PM Pacific time. They'll be told it's approved, by email with the booking or a link to confirm it.\nReply YES in the next 10 minutes to do it, or NO to cancel it.",
  },
  {
    text: "yes",
    confirm: true,
    expect: /done|approved|booked/i,
    fallback: "With a live YES, Gus answers: \"Done: Approved booking for Olivia Grant\", and her visit shows as booked.",
  },
  {
    text: "Mark LL-1036 paid by check today",
    expect: /\bYES\b/,
    fallback:
      "I will mark invoice LL-1036 (Daniel Ortiz, $290) paid by check, today.\nReply YES in the next 10 minutes to do it, or NO to cancel it.",
  },
  {
    text: "yes",
    confirm: true,
    expect: /done|paid/i,
    fallback: "With a live YES, Gus answers: \"Done: invoice LL-1036 (Daniel Ortiz, $290) is marked paid.\"",
  },
  {
    text: "Who owes me money, and for how long?",
    expect: /\$|nothing|no one|outstanding/i,
    fallback:
      "Here's who owes you, with each invoice's due date: Grace Kim $6,200, Tom Whitaker $420, Luis Romero $310.",
  },
  {
    text: "Block off Friday",
    expect: /\bYES\b/,
    fallback:
      "I will block all day Friday on your booking calendar, so no customer can book it. Visits already booked stay as they are.\nReply YES in the next 10 minutes to do it, or NO to cancel it.",
  },
  {
    text: "yes",
    confirm: true,
    expect: /done|blocked/i,
    fallback:
      "With a live YES, Gus answers: \"Done: blocked all day Friday\", and Friday shows as blocked on your calendar.",
  },
  {
    text: "Text Luis Romero: Running 15 minutes late, see you at 10:15.",
    expect: /word for word/i,
    fallback:
      'I will e-mail Luis Romero at luis.romero@example.com, subject "Message from Larkspur Lawn & Garden", this message, word for word:\n"Running 15 minutes late, see you at 10:15."\nReply YES in the next 10 minutes to do it, or NO to cancel it.',
  },
  {
    text: "no",
    confirm: true,
    expect: /cancel/i,
    fallback: "With a NO, Gus answers: \"I cancelled the pending change: e-mail Luis Romero… Nothing was changed.\"",
  },
];
