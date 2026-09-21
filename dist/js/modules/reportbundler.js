// /modules/reportbundler.js

let initializePromise = null;
let cachedRuntime = null;

export async function buildOfflineReportRuntime({
  entryUrl,
  wasmUrl
}) {
  if (cachedRuntime) {
    return cachedRuntime;
  }

  const esbuild = window.esbuild;

  if (!esbuild) {
    throw new Error(
      'The browser esbuild runtime is not loaded.'
    );
  }

  if (!initializePromise) {
    initializePromise = esbuild.initialize({
      wasmURL: wasmUrl,
      worker: true
    });
  }

  await initializePromise;

  const resolvedEntryUrl = new URL(
    entryUrl,
    window.location.href
  );

  const result = await esbuild.build({
    entryPoints: [
      resolvedEntryUrl.href
    ],

    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: true,

    plugins: [
      createHttpImportPlugin()
    ]
  });

  const outputFile =
    result.outputFiles?.[0];

  if (!outputFile?.text) {
    throw new Error(
      'The offline report runtime could not be generated.'
    );
  }

  cachedRuntime = outputFile.text;

  return cachedRuntime;
}

function createHttpImportPlugin() {
  return {
    name: 'http-imports',

    setup(build) {
      build.onResolve(
        {
          filter: /.*/
        },
        args => {
          if (args.kind === 'entry-point') {
            return {
              path: args.path,
              namespace: 'http-url'
            };
          }

          if (
            args.path.startsWith('http://') ||
            args.path.startsWith('https://')
          ) {
            return {
              path: args.path,
              namespace: 'http-url'
            };
          }

          const resolvedUrl = new URL(
            args.path,
            args.importer
          ).href;

          return {
            path: resolvedUrl,
            namespace: 'http-url'
          };
        }
      );

      build.onLoad(
        {
          filter: /.*/,
          namespace: 'http-url'
        },
        async args => {
          const response = await fetch(
            args.path,
            {
              cache: 'no-store'
            }
          );

          if (!response.ok) {
            throw new Error(
              `Unable to load module: ${args.path}`
            );
          }

          const contents =
            await response.text();

          return {
            contents,
            loader: 'js'
          };
        }
      );
    }
  };
}