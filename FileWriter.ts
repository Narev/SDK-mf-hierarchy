/// <reference path='./typings/tsd.d.ts' />
/// <reference path="./typings/node/node.d.ts" />

import when = require("when");
import fs = require("fs");


export class FileWriter {

  private fileLocation;
  private stream;

  constructor( location:string ) {
      this.fileLocation = location;

      fs.stat(this.fileLocation, function(err, stat) {
          if(err == null) {
            var newName = (new Date()).toString() + this.fileLocation;
              console.log("File exists, renaming: " + newName );
              fs.rename( this.fileLocation, newName );
          } else
          //  if(err.code == "ENOENT") {
          //     fs.writeFile('log.txt', 'Some log\n');
          // } else
           {
              console.log("Some other error: ", err.code);
          }
        });

  };

  public appendHeader( header:string ) {
    this.stream = fs.createWriteStream(this.fileLocation);
    this.stream.write( header + "\r\n");
  };

  public appendLine( line:string ) {
    this.stream.write( line + "\r\n" );
  }

  public close( ) {
    this.stream.close();
  }
}
