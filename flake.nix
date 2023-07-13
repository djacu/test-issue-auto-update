{
  description = "Southern California Nix User Group Site";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.npmlock2nix.url = "github:nix-community/npmlock2nix";
  inputs.npmlock2nix.flake = false;
  inputs.poetry2nixFlake.url = "github:nix-community/poetry2nix";
  inputs.poetry2nixFlake.inputs.nixpkgs.follows = "nixpkgs";

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    npmlock2nix,
    poetry2nixFlake,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            (self: super: {
              npmlock2nix = pkgs.callPackage npmlock2nix {};
            })
          ];
        };

        poetry2nix = poetry2nixFlake.legacyPackages.${system};

        eventShell = pkgs.npmlock2nix.v2.shell {
          src = ./.;
          nodejs = pkgs.nodejs;
          # node_modules_mode = "copy";
        };

        eventModules = pkgs.npmlock2nix.v2.node_modules {
          src = ./.;
          nodejs = pkgs.nodejs;
        };

        poetryShell = pkgs.mkShell {
          packages = [pkgs.poetry pkgs.python311];
        };

        # ended up pinning cryptography to 40.0.1
        # this might help
        # https://github.com/nix-community/poetry2nix/issues/413
        # still failed to build
        pygithubShell = poetry2nix.mkPoetryEnv {
          projectDir = ./.;
          python = pkgs.python311;

          #overrides = poetry2nix.overrides.withDefaults (final: prev: {
          #  cryptography = prev.cryptography.overridePythonAttrs (old: {
          #    cargoDeps = pkgs.rustPlatform.fetchCargoTarball {
          #      src = old.src;
          #      sourceRoot = "${old.pname}-${old.version}/src/rust";
          #      name = "${old.pname}-${old.version}";
          #      # This is what we actually want to patch.
          #      sha256 = "sha256-hkuoICa/suMXlr4u95JbMlFzi27lJqJRmWnX3nZfzKU=";
          #    };
          #  });
          #});

          #overrides = poetry2nix.overrides.withDefaults (self: super: {
          #  cryptography = super.cryptography.overridePythonAttrs (old: {
          #    cargoDeps = pkgs.rustPlatform.fetchCargoTarball {
          #      inherit (old) src;
          #      name = "${old.pname}-${old.version}";
          #      sourceRoot = "${old.pname}-${old.version}/src/rust/";
          #      sha256 = "sha256-hkuoICa/suMXlr4u95JbMlFzi27lJqJRmWnX3nZfzKU=";
          #    };
          #    cargoRoot = "src/rust";
          #    nativeBuildInputs =
          #      old.nativeBuildInputs
          #      ++ (with pkgs.rustPlatform; [
          #        pkgs.rustc
          #        pkgs.cargo
          #        cargoSetupHook
          #      ]);
          #  });
          #});
        };
      in {
        devShells = {
          inherit eventShell poetryShell pygithubShell;
        };
        packages.eventModules = eventModules;
      }
    );
}
