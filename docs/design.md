# Design

The app has two activities: a live quiz that everyone plays at the same moment,
and a photo contest for the best photo with or of Dilara, which runs all day.
Everything guests do happens on their own phone. The laptop shows the join QR
code and runs the admin view; it is not a shared game screen.

## Look and language

- The guest UI is in Swedish. The admin view can stay in English.
- The theme matches the party: snow, ice and princess, in light blue, white and
  silver, with snowflakes and a bit of sparkle.
- The look is "Ice block", a playful neo-brutalist style. Cards and buttons are
  chunky frozen blocks with thick navy outlines, hard offset shadows, snow caps
  on top and icicles dripping from the edges. Pink is the small princess
  accent, with a tiara for the leader and the winners.
- Headings use Archivo Black and body text Space Grotesk, self-hosted as small
  subsets that cover Swedish (`scripts/subset-fonts.sh`).
- Motion is CSS only: blocks drop in and squash, caps plop, icicles grow, snow
  falls, and the finale cracks a block of ice open. Animations stop while the
  page is hidden, and with reduced motion the pages are still.
- The admin view uses the same language with thinner lines and less decoration,
  so it stays dense. The bare domain page stays plain.

## Pages

- **Bare domain**: a plain, neutral page with nothing about the party. A guest
  who has joined goes straight on to the guest app.
- **Join link** (`/j/<secret>`): the landing page. A themed welcome ("Dilara
  fyller 3!"), a photo of Dilara uploaded through the admin view, and a field for
  the guest's name.
- **Guest app**, after joining, has three tabs:
  - **Quiz**: locked until the host unlocks it.
  - **Mitt foto**: upload, replace or remove your contest photo.
  - **Galleri**: all current contest photos, where guests vote.
- **Admin view**, behind its own secret, works on the laptop and on a phone.

## Identity

- Joining sets a cookie with a random player ID, linked to the name the guest
  types. Uploads, votes and quiz answers are all recorded against that ID.
- A guest joins once per phone and never needs the code again on it. The guest
  app keeps a copy of the signed player ID in the phone's local storage. If the
  browser loses the cookie, the bare page, the app and the join link give it
  back from that copy, without the code. The server checks the signature and
  that the player still exists. An ended party still lets that guest back in,
  because only new guests are refused. The copy never holds the join secret.
- A reset or a wipe deletes the players, so a phone that comes back with an old
  copy is refused, forgets it, and stays on the bare page.
- If a guest loses both (another browser, cleared website data, a QR scanner
  with its own built-in browser) and joins with a name that already exists, the
  phone asks "Is this you?" and gives them their old identity back. Anyone could
  claim someone else's name this way; that is an accepted risk at a birthday
  party.
- The admin view can merge duplicate players by hand.

## Quiz

- About 10 questions, written and edited in the admin view and stored in the
  Durable Object, never in the repo.
- Question types: multiple choice with an optional photo, and closest number.
- The host unlocks the quiz. Every connected phone then shows a popup announcing
  it and offering to switch to the Quiz tab.
  - The popup only reaches phones with the app open. A phone that is locked or
    has the browser in the background gets it when the guest next opens the app,
    so the host should also announce the quiz out loud.
  - Vibration works on Android but not on iPhone Safari, so it is only a bonus.
- The host starts each question. Phones show the question, the options, any
  photo and a countdown.
  - The whole question fits above the tab bar without scrolling on a 375x548
    screen, an iPhone SE in Safari with both toolbars showing. The photo takes
    the height the rest leaves, shown whole, between a small minimum and a
    maximum. Four short options sit two to a row. Every option is at least
    44 px each way.
  - A question too long for the screen shows a button, "Scrolla ner för att
    svara", until the options are in view. A guest who has to scroll can tap
    an option that is still moving, and iPhone Safari takes that first tap as
    stopping the scroll, not as an answer.
- The server owns the clock. Phones count down to a deadline set by the server,
  and answers are accepted until that deadline plus a short grace period, so a
  slow connection does not cost anyone points.
- Answers close at the deadline plus the grace period, or as soon as everyone
  online has answered. The server then reveals the result at once, and every
  phone shows whether it was right and how the room answered.
- About 6 seconds after the reveal, the server shows the leaderboard on its
  own. Every phone shows the top five and the guest's own position, with
  players animating up and down into their new places. It stays until the host
  starts the next question.
- The host can still press Reveal to cut a question short, or Leaderboard to
  skip the wait. Reveal asks first while guests are still answering, and says
  how many. A press that arrives after the server has taken that step changes
  nothing.
- Scoring rewards speed. A correct multiple-choice answer scores 1000 points
  for an instant answer, falling linearly to 500 at the deadline, rounded to
  whole points. A wrong or missing answer scores 0, so being right always beats
  being fast. On closest-number questions the closest guess scores 1000 however
  long it took, and equally close guesses all score 1000.
- Each answer is timed on the phone, so a slow connection never costs points.
  The phone starts its timer when the question is on screen, after its photo
  has loaded, stops it at the tap and sends the elapsed time with the answer.
  A question's photo is served to guests only once that question has started
  in the current run, so a leaked or guessed link can't show it early. Phones
  therefore fetch it when the question starts. A slow photo shortens the
  countdown on that phone but never costs points.
- The server clamps the reported time to at least 0, to at most its own time
  between sending the question to that phone and receiving the answer, and to
  the answer window. A phone could still report less time than it took, within
  that bound. That is an accepted risk at a children's party.
- A tie for first place means joint quiz winners. There is no tie-breaker
  question; with speed points a tie is unlikely.
- A guest who joins late plays from the current question. A phone that
  reconnects comes back to the current question with its answer and score
  intact.

## Photo contest

- Each guest has one contest photo at a time. They can replace it or remove it
  whenever they like.
- Phones shrink photos before upload (about 1600 px, JPEG, around 300 KB). The
  re-encode also strips EXIF data, including GPS location.
- Photos are stored in the Durable Object's SQLite database, with their owner
  and status, so the app stays on the free plan with no card on file. Phones
  also make a small thumbnail at upload (about 400 px), which the gallery uses,
  so browsing costs little data. Photos are fetched through a Worker route that
  checks the join cookie. See [hosting.md](hosting.md).
- Every version a guest uploads is kept in storage for the hosts to go through
  later. Removing a photo hides it without deleting it, and any votes on it go
  back to the voters.
- Replacing a photo that has votes moves the old photo to a **hall of fame**
  section of the gallery. It keeps its votes, can still get and lose votes, and
  can still win. It leaves the hall of fame when its last vote moves away.
  Replaced photos without votes are never shown again. Before replacing or
  removing, the uploader sees how many votes the photo has and what will happen
  to them.
- The gallery shows current photos and the hall of fame, without names or vote
  counts. Names and counts are revealed with the results. Each uploader sees
  how many votes their own photo has.
- Voting is open during the day. Each guest has 3 votes, can put more than one
  of them on the same photo, can't vote for their own photo, and can move votes
  until voting closes.
- The host closes uploads and voting from the admin view. The photo with the
  most votes wins. The host, or Dilara, breaks a tie.
- The host can hide any photo from the gallery. Its votes go back to the voters.

## Finale

- Each competition has its own prize and its own finale. The host runs the
  quiz finale right after the quiz and the photo finale whenever they like,
  usually hours later. Either can come first.
- Each finale takes two presses. The first opens its suspense page, a themed
  waiting screen that builds anticipation. The second reveals the winner: the
  quiz winner, or the joint winners if first place is tied, or the winning
  photo with the photographer's name.
- The quiz finale opens once the quiz has ended, and the quiz can't change
  after that. Uploads and voting stay open.
- The photo finale's suspense page closes uploads and voting. It can't open
  while the quiz is running, and the quiz waits while it is on the phones.
- Only one suspense page is on the phones at a time, so the other finale
  opens once this one is revealed.
- A tie for the most photo votes shows the tied photos in the admin view, and
  the host picks the winner at any point before revealing it.
- Each reveal is a short celebration on every phone at once. The winner's own
  phone also congratulates them. The photo reveal keeps a small recap of the
  quiz winners once they are out.
- After a reveal, `Tillbaka till festen` takes the guest back to the app, and
  a minute after the reveal every phone goes back on its own. The Quiz tab
  then shows the quiz winners, and the gallery opens with the winning photo.
  A quiz the host starts during that minute takes over the phones at once.
- A phone that joins or reconnects during a finale lands on the current step:
  the suspense page, the reveal for the rest of its minute, or the app.
- Each winner is fixed when it is revealed.

## Admin view

- QR code and short join code.
- Players: list, rename, merge duplicates.
- Questions: add, edit, delete, reorder, attach a photo.
- Quiz controls: unlock, start each question, reveal early, skip ahead to the
  leaderboard, end, reset. During a reveal, a note says the leaderboard
  follows on its own.
- Finale controls, one card per finale: open its suspense page, confirmed with
  what it does, and reveal its winner. While a winner is on the phones, a note
  says the phones go back to the party on their own.
- Contest controls: close uploads and voting, hide photos, browse every stored
  version, download everything.
- Landing page photo upload.
- End the party, which refuses new guests. A guest who is already in can still
  get back in by name.
- Wipe the data, photos included, once the party has ended. The confirmation
  reminds the host to download the photos first.
- Reset the party at any time, for a fresh start after a rehearsal. Every
  guest's phone leaves for the bare page, the players, contest photos, votes,
  quiz answers and scores and both finales are cleared, and new guests can join
  again. The questions, their photos and the landing photo stay. The host types
  RESET to confirm.
