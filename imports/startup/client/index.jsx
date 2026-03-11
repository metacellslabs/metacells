import { Meteor } from 'meteor/meteor';
import { createRoot } from 'react-dom/client';
import { App } from '../../ui/app/App.jsx';
import '../../../client/main.css';

Meteor.startup(() => {
  const container = document.getElementById('react-target');
  const root = createRoot(container);
  root.render(<App />);
});
