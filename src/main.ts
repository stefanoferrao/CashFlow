import '@fontsource-variable/dm-sans';
import 'gridstack/dist/gridstack.min.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import { startApp } from './app';
import { setupPwa } from './pwa';

setupPwa();
void startApp();
