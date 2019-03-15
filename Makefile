
build: node_modules
	node build_site.js

node_modules: package.json
	npm install

.PHONY: build
