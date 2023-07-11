{
  description = "Southern California Nix User Group Site";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";
  inputs.npmlock2nix.url = "github:nix-community/npmlock2nix";
  inputs.npmlock2nix.flake = false;

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    npmlock2nix,
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

        eventShell = pkgs.npmlock2nix.v2.shell {
          src = ./.;
          nodejs = pkgs.nodejs;
          # node_modules_mode = "copy";
        };

        eventModules = pkgs.npmlock2nix.v2.node_modules {
          src = ./.;
          nodejs = pkgs.nodejs;
        };
      in {
        devShells.eventShell = eventShell;
        packages.eventModules = eventModules;
      }
    );
}
