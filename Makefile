.PHONY: install test build demo golden check

install:
	npm install

build:
	npm run build

test:
	npm test

demo:
	npm run demo

golden:
	npm run golden

check:
	npm run check
