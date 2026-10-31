# Design

The app has two activities: a live quiz that everyone plays at the same moment,
and a photo contest for the best photo with or of Dilara, which runs all day.
Everything guests do happens on their own phone. The laptop shows the join QR
code and runs the admin view; it is not a shared game screen.

## Look and language

- The guest UI is in Swedish. The admin view can stay in English.
- The theme matches the party: snow, ice and princess, in light blue, white and
  silver, with snowflakes and a bit of sparkle.

## Pages

- **Bare domain**: a plain, neutral page with nothing about the party.
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
- If a guest loses the cookie (another browser, cleared cookies, a QR scanner
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
- The server owns the clock. Phones count down to a deadline set by the server,
  and answers are accepted until that deadline plus a short grace period, so a
  slow connection does not cost anyone points.
- Answers close at the deadline or when everyone has answered. The host then
  reveals the result, and every phone shows whether it was right and how the
  room answered.
- After a reveal, the host can show the leaderboard, so it can come after every
  question or every second one. Every phone shows the top five and the guest's
  own position, with players animating up and down into their new places.
- Scoring rewards speed. A correct multiple-choice answer scores 1000 points
  for an instant answer, falling linearly to 500 at the deadline, rounded to
  whole points. A wrong or missing answer scores 0, so being right always beats
  being fast. On closest-number questions the closest guess scores 1000 however
  long it took, and equally close guesses all score 1000.
- Each answer is timed on the phone, so a slow connection never costs points.
  The phone starts its timer when the question is on screen, after its photo
  has loaded, stops it at the tap and sends the elapsed time with the answer.
  Phones load the next question's photo ahead of time so it doesn't hold the
  question up.
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

- Each competition has its own prize.
- When the last quiz question is done, the host moves everyone to a suspense
  page: a themed waiting screen that builds anticipation. Photo voting closes
  when it opens.
- The host then opens the winners page and reveals the winners one at a time,
  each with its own press: first the winning photo with the photographer's name,
  then the quiz winner, or the joint winners if first place is tied.

## Admin view

- QR code and short join code.
- Players: list, rename, merge duplicates.
- Questions: add, edit, delete, reorder, attach a photo.
- Quiz controls: unlock, start question, reveal, show leaderboard, next, end.
- Finale controls: open the suspense page, reveal the photo winner, reveal the
  quiz winner.
- Contest controls: close uploads and voting, hide photos, browse every stored
  version, download everything.
- Landing page photo upload.
- End the party and wipe the data, after downloading the photos.
