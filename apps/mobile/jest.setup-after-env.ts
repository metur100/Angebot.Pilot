import { configure } from '@testing-library/react-native';

// Router-level screens render a lot on first mount; allow more than the default 1 s on slow CI machines.
configure({ asyncUtilTimeout: 8000 });

jest.setTimeout(30000);
