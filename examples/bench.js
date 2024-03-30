import {Observer, html, mount, OArray } from '/index.js';
import {atomic} from 'destam/Network';

const adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"],
  colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"],
  nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];

function _random (max) { return Math.round(Math.random() * 1000) % max; };

const Button = ({ id, text, fn }) => {
  return html `<div class='col-sm-6 smallpad'>
    <button id=${id} class='btn btn-primary btn-block' type='button' $onclick=${fn}>${text}</button>
  </div>`
};

const App = () => {
	let selected = Observer.mutable(null);
	let array = OArray();

  const appendData = count => atomic(() => {
    for (let i = 0; i < count; i++) {
      let label = Observer.mutable(`${adjectives[_random(adjectives.length)]} ${colours[_random(colours.length)]} ${nouns[_random(nouns.length)]}`);

      const dom = html`
        <tr class=${selected.map(sel => sel === dom ? "danger": "")}>
          <td class='col-md-4'><a $onclick=${() => selected.set(dom)}>${label}</a></td>
          <td class='col-md-1'><a $onclick=${() => remove(dom)}><span class='glyphicon glyphicon-remove' aria-hidden="true" />x</a></td>
          <td class='col-md-6'/>
        </tr>
      `;

      dom.label = label;
      array.push(dom);
    }
  });

	const
    run = () => {
      array.splice(0, array.length);
      appendData(1000);
    },
    runLots = () => {
      array.splice(0, array.length);
      appendData(10000)
    },
    add = () => appendData(1000),
    update = () => {
      for(let i = 0, len = array.length; i < len; i += 10)
        array[i].label.set(array[i].label.get() + ' !!!');
    },
    swapRows = () => {
      if (array.length > 998) {
        atomic (() => {
          let tmp = array[1];
          array[1] = array[998];
          array[998] = tmp;
        });
      }
    },
    clear = () => {
      array.splice(0, array.length);
    },
    remove = row => {
      const idx = array.indexOf(row);
      array.splice(idx, 1);
    };

  return html`
    <style>
      body {
          padding: 10px 0 0 0;
          margin: 0;
          overflow-y: scroll;
      }
      #duration {
          padding-top: 0px;
      }
      .jumbotron {
          padding-top:10px;
          padding-bottom:10px;
      }
      .test-data a {
          display: block;
      }
      .preloadicon {
          position: absolute;
          top:-20px;
          left:-20px;
      }
      .col-sm-6.smallpad {
          padding: 5px;
      }
      .jumbotron .row h1 {
          font-size: 40px;
      }
    </style>
    <div class='container'>
      <div class='jumbotron'><div class='row'>
        <div class='col-md-6'><h1>SolidJS Keyed</h1></div>
        <div class='col-md-6'><div class='row'>
          <${Button} id='run' text='Create 1,000 rows' fn=${run} />
          <${Button} id='runlots' text='Create 10,000 rows' fn=${runLots} />
          <${Button} id='add' text='Append 1,000 rows' fn=${add} />
          <${Button} id='update' text='Update every 10th row' fn=${update} />
          <${Button} id='clear' text='Clear' fn=${clear} />
          <${Button} id='swaprows' text='Swap Rows' fn=${swapRows} />
        </div></div>
      </div></div>
      <table class='table table-hover table-striped test-data'><tbody>
        ${array}
      </tbody></table>
      <span class='preloadicon glyphicon glyphicon-remove' aria-hidden="true" />
    </div>
  `;
}

mount(document.body, App());
