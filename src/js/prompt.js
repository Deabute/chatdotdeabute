// prompt.js Copyright 2020 Paul Beaudet MIT License
import persistence from './persistence.js';
import rtc from './rtc.js';

const prompt = {
  caller: false,
  field: document.getElementById('promptField'),
  form: document.getElementById('promptForm'),
  nps: {
    id: 'usernps',
    question:
      'How did it go? If you knew them better, or you do know them, would you introduce them to another friend?',
    answers: ['definitely not', 'no', 'meh', 'yes', 'definitely'],
  },
  review: {
    id: 'review',
    question: 'How did the conversation go?',
    answers: [
      'There was a general app issue',
      'There was a signal issue, could only clearly hear one or neither side',
      'Other person was difficult to talk to',
      'Conversation was "okay"',
      'Worked well, conversation was good',
      'That was great, would talk to someone like that again',
    ],
  },
  answers: document.getElementById('formAnswers'),
  create: (questionObj, onAnswer) => {
    if (!prompt.form.hidden) {
      return;
    } // prevent one prompt from being created on top of other
    // by only creating prompt from shown form state
    prompt.form.hidden = false;
    // Show prompt form
    prompt.field.innerHTML = questionObj.question;
    const answerBundle = document.createElement('div');
    answerBundle.id = 'answerBundle';
    prompt.answers.appendChild(answerBundle);
    const halfway = Math.floor(questionObj.answers.length / 2);
    // figure middle answer index
    for (let i = 0; i < questionObj.answers.length; i++) {
      const radioLabel = document.createElement('label');
      const radioOption = document.createElement('input');
      if (i === halfway) {
        radioOption.checked = true;
      } // set default selection
      radioLabel.for = 'answer' + i;
      radioLabel.innerHTML = questionObj.answers[i];
      radioOption.id = 'answer' + i;
      radioOption.type = 'radio';
      radioOption.name = 'answer';
      radioOption.value = i;
      answerBundle.appendChild(radioOption);
      answerBundle.appendChild(radioLabel);
      // append option and label
      answerBundle.appendChild(document.createElement('br'));
    }
    prompt.form.addEventListener(
      'submit',
      event => {
        event.preventDefault();
        const radios = document.getElementsByName('answer');
        const unifiedIndex = 4 - halfway;
        // determines relative start value from universal middle value
        for (let entry = 0; entry < radios.length; entry++) {
          // for all possible current question answers
          if (radios[entry].checked) {
            // find checked entry
            const answer = {
              oid: rtc.lastPeer,
              score: unifiedIndex + entry,
              id: questionObj.id,
            };
            for (let peer = 0; peer < persistence.answers.length; peer++) {
              // for existing user answer entries
              if (
                persistence.answers[peer].oid === rtc.lastPeer &&
                persistence.answers.id === questionObj.id
              ) {
                // overwrite existing entries
                persistence.answers[peer].score = unifiedIndex + entry;
                // add property to entry
                persistence.answers[peer].id = questionObj.id;
                prompt.onSubmit(onAnswer, answer);
                return; // save and end function
              }
            }

            persistence.answers.push(answer);
            // if peer not found push as new entry
            prompt.onSubmit(onAnswer, answer);
            return;
            // save and end function
          }
        }
      },
      false
    );
  },
  onSubmit: (whenDone, answer) => {
    localStorage.answers = JSON.stringify(persistence.answers);
    // save any recorded answer
    prompt.caller = false;
    prompt.answers.innerHTML = '';
    prompt.form.hidden = true;
    prompt.field.innerHTML = '';
    whenDone(answer);
  },
};

export default prompt;
